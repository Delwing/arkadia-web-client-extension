package main

import (
	"encoding/binary"
	"errors"
	"time"
)

// Wire format, proxy -> client.
//
// Raw bytes cannot carry a time, and replayed output describes things that happened
// minutes ago: a client that stamps its own clock while processing a replayed line
// records when the browser woke up rather than when the event happened. Counters,
// timers and progress tracking all skew by the length of the detach. So every
// downstream chunk carries the moment the proxy received it.
//
//	byte 0     frame type
//	bytes 1-8  int64 big-endian, unix milliseconds
//	bytes 9..  payload
//
// Client -> proxy stays raw and unframed. Input needs no timestamp, and leaving that
// direction alone keeps the client's send path unchanged.
const (
	// FrameData carries game bytes exactly as they came off the telnet socket.
	FrameData byte = 0x01
	// FrameControl carries a JSON object describing the session (see controlPayload).
	FrameControl byte = 0x02
)

const frameHeaderLen = 9

// ErrShortFrame means the payload is too small to hold a header.
var ErrShortFrame = errors.New("frame shorter than header")

func encodeFrame(kind byte, at time.Time, payload []byte) []byte {
	out := make([]byte, frameHeaderLen+len(payload))
	out[0] = kind
	binary.BigEndian.PutUint64(out[1:frameHeaderLen], uint64(at.UnixMilli()))
	copy(out[frameHeaderLen:], payload)
	return out
}

func decodeFrame(frame []byte) (kind byte, at time.Time, payload []byte, err error) {
	if len(frame) < frameHeaderLen {
		return 0, time.Time{}, nil, ErrShortFrame
	}
	kind = frame[0]
	at = time.UnixMilli(int64(binary.BigEndian.Uint64(frame[1:frameHeaderLen])))
	payload = frame[frameHeaderLen:]
	return kind, at, payload, nil
}
