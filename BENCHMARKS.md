# Benchmark Log
Documenting the current serialization performance baseline for quick comparisons.

## 2024-11-?? – Server serialization comparison
- Command: `node server/test/json-bench.js 256 60`
- JSON snapshot payload: 78,782 bytes (~76.94 KiB); protobuf: 23,436 bytes (~22.89 KiB)
- JSON player snapshot parse: ~436 µs/update (2.62% of a 16.67 ms frame @ 60 Hz)
- Protobuf player snapshot decode: ~326 µs/update (1.96% of 16.67 ms)
- Protobuf decode with fresh buffer: ~250 µs/update
- Bullet payload: 155 bytes JSON vs 60 bytes protobuf
- JSON bullet parse: ~1.20 µs/op; protobuf decode: ~0.65 µs/op
- JSON stringify/update and protobuf encode/decode stats listed in command output for reference.

## 2024-11-?? – Client benchmarks
- Command: `node client/test/json-client-bench.js 256 60 6`
  - Snapshot parse + merge: ~511 µs/update (3.07% of a 16.67 ms frame) for 256 players
  - Bullet parse: ~1.43 µs/op
- Command: `node client/test/proto-client-bench.js 256 60 6`
  - Snapshot decode (shared buffer): ~303 µs/update (1.82% of a 16.67 ms frame)
  - Snapshot decode + merge: ~301 µs/update (1.80% frame)
  - Bullet decode: ~1.64 µs/op

Keep this log updated as serialization/merge routines evolve so future comparisons have concrete numbers.
