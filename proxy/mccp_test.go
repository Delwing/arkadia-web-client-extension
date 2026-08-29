package main

import (
	"bytes"
	"compress/zlib"
	"io"
	"net"
	"sync"
	"testing"
	"time"
)

// scriptedConn replays a fixed list of reads, one per Read call, so a test can put a
// telnet sequence's bytes on either side of a packet boundary deliberately.
type scriptedConn struct {
	net.Conn
	mu      sync.Mutex
	reads   [][]byte
	written bytes.Buffer
	done    bool
}

func (c *scriptedConn) Read(p []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.reads) == 0 {
		c.done = true
		return 0, io.EOF
	}
	n := copy(p, c.reads[0])
	if n < len(c.reads[0]) {
		c.reads[0] = c.reads[0][n:]
	} else {
		c.reads = c.reads[1:]
	}
	return n, nil
}

func (c *scriptedConn) Write(p []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.written.Write(p)
}

func (c *scriptedConn) Close() error                       { return nil }
func (c *scriptedConn) SetDeadline(t time.Time) error      { return nil }
func (c *scriptedConn) SetReadDeadline(t time.Time) error  { return nil }
func (c *scriptedConn) SetWriteDeadline(t time.Time) error { return nil }

// readAll drains an mccpConn to EOF.
func readAll(t *testing.T, m *mccpConn) []byte {
	t.Helper()
	out, err := io.ReadAll(m)
	if err != nil && err != io.EOF {
		t.Fatalf("read: %v", err)
	}
	return out
}

func deflate(t *testing.T, payload []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zlib.NewWriter(&buf)
	if _, err := w.Write(payload); err != nil {
		t.Fatalf("deflate: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("deflate close: %v", err)
	}
	return buf.Bytes()
}

func TestPassesThroughWhenGameNeverOffersCompression(t *testing.T) {
	conn := &scriptedConn{reads: [][]byte{[]byte("Arkadia\r\nlogin: ")}}
	got := readAll(t, newMccpConn(conn, nil))

	if string(got) != "Arkadia\r\nlogin: " {
		t.Fatalf("got %q", got)
	}
	if conn.written.Len() != 0 {
		t.Fatalf("wrote %q upstream with nothing to answer", conn.written.Bytes())
	}
}

func TestAcceptsCompressionAndInflates(t *testing.T) {
	body := deflate(t, []byte("jestes w lesie.\r\n"))
	conn := &scriptedConn{reads: [][]byte{
		append([]byte{telnetIAC, telnetWILL, optCompress2},
			append([]byte{telnetIAC, telnetSB, optCompress2, telnetIAC, telnetSE}, body...)...),
	}}

	var started bool
	got := readAll(t, newMccpConn(conn, func() { started = true }))

	if string(got) != "jestes w lesie.\r\n" {
		t.Fatalf("got %q, want the inflated text", got)
	}
	if !started {
		t.Fatal("compression engaged without reporting it")
	}
	if !bytes.Equal(conn.written.Bytes(), mccpDo) {
		t.Fatalf("answered %q, want IAC DO COMPRESS2", conn.written.Bytes())
	}
}

// The negotiation the client must never see: it has no decoder state to offer, and a
// second peer answering would leave the game with two clients for one zlib stream.
func TestCompressionNegotiationIsNotForwarded(t *testing.T) {
	body := deflate(t, []byte("ok"))
	conn := &scriptedConn{reads: [][]byte{
		append([]byte{
			'a',
			telnetIAC, telnetWILL, optCompress2,
			'b',
			telnetIAC, telnetSB, optCompress2, telnetIAC, telnetSE,
		}, body...),
	}}

	got := readAll(t, newMccpConn(conn, nil))
	if string(got) != "abok" {
		t.Fatalf("got %q, want the negotiation stripped", got)
	}
}

// A substring scan would miss this, and the stream would silently never compress.
func TestNegotiationSplitAcrossReads(t *testing.T) {
	body := deflate(t, []byte("witaj"))
	conn := &scriptedConn{reads: [][]byte{
		{telnetIAC},
		{telnetWILL},
		{optCompress2, telnetIAC, telnetSB},
		{optCompress2, telnetIAC},
		append([]byte{telnetSE}, body...),
	}}

	got := readAll(t, newMccpConn(conn, nil))
	if string(got) != "witaj" {
		t.Fatalf("got %q", got)
	}
	if !bytes.Equal(conn.written.Bytes(), mccpDo) {
		t.Fatalf("answered %q, want IAC DO COMPRESS2", conn.written.Bytes())
	}
}

// Everything that is not COMPRESS2 has to reach the client untouched — GMCP, ECHO, the
// prompt markers the client uses to end a line.
func TestOtherTelnetIsForwardedVerbatim(t *testing.T) {
	gmcp := []byte{telnetIAC, telnetSB, 201}
	gmcp = append(gmcp, []byte(`char.state {"hp":6}`)...)
	gmcp = append(gmcp, telnetIAC, telnetSE)

	input := []byte{telnetIAC, telnetWILL, 201} // IAC WILL GMCP
	input = append(input, gmcp...)
	input = append(input, telnetIAC, telnetIAC) // escaped 255 in the text
	input = append(input, telnetIAC, 249)       // IAC GA, the prompt marker
	input = append(input, []byte("dalej")...)

	conn := &scriptedConn{reads: [][]byte{input}}
	got := readAll(t, newMccpConn(conn, nil))

	if !bytes.Equal(got, input) {
		t.Fatalf("got %q, want the input unchanged", got)
	}
}

// An IAC SE inside a subnegotiation body is only a terminator when it follows an
// unescaped IAC; a doubled IAC is data.
func TestEscapedIacInsideSubnegotiation(t *testing.T) {
	input := []byte{telnetIAC, telnetSB, 201}
	input = append(input, telnetIAC, telnetIAC, telnetSE) // escaped IAC, then a literal SE byte
	input = append(input, telnetIAC, telnetSE)            // the real terminator
	input = append(input, []byte("po")...)

	conn := &scriptedConn{reads: [][]byte{input}}
	got := readAll(t, newMccpConn(conn, nil))

	if !bytes.Equal(got, input) {
		t.Fatalf("got %q, want the input unchanged", got)
	}
}

// Compressed output arriving in its own packet, after the announcement — the ordinary
// case once a session is running.
func TestInflatesAcrossSubsequentReads(t *testing.T) {
	body := deflate(t, []byte("pierwsza linia\r\ndruga linia\r\n"))
	conn := &scriptedConn{reads: [][]byte{
		{telnetIAC, telnetWILL, optCompress2},
		{telnetIAC, telnetSB, optCompress2, telnetIAC, telnetSE},
		body[:4],
		body[4:],
	}}

	got := readAll(t, newMccpConn(conn, nil))
	if string(got) != "pierwsza linia\r\ndruga linia\r\n" {
		t.Fatalf("got %q", got)
	}
}

// Player input is not compressed by MCCP in either direction, and must reach the game
// exactly as the client sent it.
func TestWritesPassThrough(t *testing.T) {
	conn := &scriptedConn{}
	m := newMccpConn(conn, nil)

	if _, err := m.Write([]byte("polnoc\n")); err != nil {
		t.Fatalf("write: %v", err)
	}
	if conn.written.String() != "polnoc\n" {
		t.Fatalf("game received %q", conn.written.String())
	}
}
