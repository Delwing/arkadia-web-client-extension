package main

import (
	"bytes"
	"compress/zlib"
	"io"
	"net"
)

/*
MCCP2 termination.

Compression is worth having on a MUD — the output is repetitive text and deflate takes
70-90% off it — but a client behind this proxy cannot speak MCCP end to end. MCCP2 is a
single zlib stream for the life of the telnet connection, so a client attaching halfway
through has no decoder state and inflates garbage. That is why the client declines it on
a session proxy.

Declining is not the same as doing without. This process holds the telnet connection for
the whole session, which makes it the right end of the wire to be the zlib peer: it
negotiates COMPRESS2 with the game, inflates, and hands the client plaintext. Sessions
buffer plaintext too, so replay is unaffected and the sizing in main.go still holds.

The browser hop is then compressed by the WebSocket layer instead (permessage-deflate,
enabled in main.go), whose context is per-connection — a fresh attach starts a fresh
context, which is exactly the property MCCP lacks.

Only the game-to-client direction is compressed; MCCP has never covered player input, so
writes pass straight through the embedded net.Conn.
*/

// Telnet control bytes, and the option we care about.
const (
	telnetSE   = 240
	telnetSB   = 250
	telnetWILL = 251
	telnetWONT = 252
	telnetDO   = 253
	telnetDONT = 254
	telnetIAC  = 255

	optCompress2 = 86 // MCCP2
)

var mccpDo = []byte{telnetIAC, telnetDO, optCompress2}

// Parser states. Negotiation can be split across TCP reads at any byte, so this is a
// state machine rather than a search for byte sequences: a substring scan misses an
// `IAC WILL COMPRESS2` that straddles two packets, and the failure mode is a stream that
// is never compressed and a WILL the client was not meant to see.
const (
	stText = iota
	stIAC
	stCmd       // IAC + WILL/WONT/DO/DONT, awaiting the option
	stSBOption  // IAC SB, awaiting the option
	stSubneg    // inside a subnegotiation we are passing through
	stSubnegIAC // ... and we just saw an IAC inside it
	stMccpSB    // inside IAC SB COMPRESS2, awaiting IAC SE
	stMccpSBIAC // ... and we just saw the IAC
)

// mccpConn is a net.Conn whose reads are the game's output with MCCP2 unwrapped.
//
// Reads block until the game sends something, and the upstream must carry no read
// deadline: a MUD connection is idle most of the time, and zlib.NewReader blocks on the
// stream header, so an expiring deadline would look like a dead game. Nothing in this
// program sets one — Session.pump reads straight through — and a timeout reaching pump
// would end the session anyway, so this makes no attempt to soften one.
type mccpConn struct {
	net.Conn

	scratch []byte
	out     bytes.Buffer // plaintext produced by the scanner, not yet handed up
	err     error        // sticky read error, returned once `out` is drained

	state        int
	cmd          byte
	wantCompress bool // saw WILL COMPRESS2; owes the game a DO

	compressed bool      // the game has announced the switch to zlib
	head       []byte    // compressed bytes that arrived in the announcing packet
	inflate    io.Reader // built lazily; see Read
	onStart    func()    // called when compression engages, for logging
}

func newMccpConn(conn net.Conn, onStart func()) *mccpConn {
	return &mccpConn{Conn: conn, scratch: make([]byte, 32*1024), onStart: onStart}
}

func (m *mccpConn) Read(p []byte) (int, error) {
	for {
		if m.out.Len() > 0 {
			return m.out.Read(p)
		}
		if m.err != nil {
			return 0, m.err
		}
		if m.compressed {
			// Built here rather than where the switch was announced, because
			// zlib.NewReader blocks reading the stream header and the game sends it
			// only when it next has output. Doing that eagerly would hold back the
			// plaintext scanned out of the very same packet — the login banner, which
			// arrives immediately before the announcement.
			if m.inflate == nil {
				zr, zerr := zlib.NewReader(io.MultiReader(bytes.NewReader(m.head), m.Conn))
				if zerr != nil {
					m.err = zerr
					continue
				}
				m.inflate = zr
			}
			// Past negotiation the scanner is out of the way entirely: everything the
			// game sends from here is deflate, and whatever telnet it contains is the
			// client's business, forwarded verbatim.
			return m.inflate.Read(p)
		}

		n, err := m.Conn.Read(m.scratch)
		if n > 0 {
			leftover, started := m.feed(m.scratch[:n])
			if m.wantCompress {
				m.wantCompress = false
				if _, werr := m.Conn.Write(mccpDo); werr != nil {
					m.err = werr
				}
			}
			if started {
				// Copied because scratch is reused by the next read, and these bytes
				// wait until the inflater is built.
				m.head = append([]byte(nil), leftover...)
				m.compressed = true
				if m.onStart != nil {
					m.onStart()
				}
			}
		}
		if err != nil && m.err == nil {
			m.err = err
		}
	}
}

/*
feed runs the scanner over one read, appending everything the client should see to `out`.

It returns the bytes following the COMPRESS2 subnegotiation once the game has switched
the stream, since those are already deflate and belong to the inflater rather than here.
*/
func (m *mccpConn) feed(data []byte) (leftover []byte, started bool) {
	for i := 0; i < len(data); i++ {
		b := data[i]
		switch m.state {
		case stText:
			if b == telnetIAC {
				m.state = stIAC
			} else {
				m.out.WriteByte(b)
			}

		case stIAC:
			switch b {
			case telnetWILL, telnetWONT, telnetDO, telnetDONT:
				m.cmd = b
				m.state = stCmd
			case telnetSB:
				m.state = stSBOption
			default:
				// IAC IAC and every other two-byte command: not ours.
				m.out.Write([]byte{telnetIAC, b})
				m.state = stText
			}

		case stCmd:
			if m.cmd == telnetWILL && b == optCompress2 {
				// Answered after this batch, and deliberately not forwarded: the client
				// has no use for an offer this end has already accepted, and a client
				// that answered it too would leave the game with two peers for one
				// zlib stream.
				m.wantCompress = true
			} else {
				m.out.Write([]byte{telnetIAC, m.cmd, b})
			}
			m.state = stText

		case stSBOption:
			if b == optCompress2 {
				m.state = stMccpSB
			} else {
				// GMCP and friends stream through without being buffered whole; only
				// the option byte had to be seen to know it is not ours.
				m.out.Write([]byte{telnetIAC, telnetSB, b})
				m.state = stSubneg
			}

		case stSubneg:
			m.out.WriteByte(b)
			if b == telnetIAC {
				m.state = stSubnegIAC
			}

		case stSubnegIAC:
			m.out.WriteByte(b)
			if b == telnetSE {
				m.state = stText
			} else {
				// Including an escaped IAC IAC, which is body, not a terminator.
				m.state = stSubneg
			}

		case stMccpSB:
			if b == telnetIAC {
				m.state = stMccpSBIAC
			}
			// Anything else here is malformed. Dropping it is right: the option carries
			// no payload, so there is nothing a well-formed server could be saying.

		case stMccpSBIAC:
			if b == telnetSE {
				m.state = stText
				return data[i+1:], true
			}
			m.state = stMccpSB
		}
	}
	return nil, false
}
