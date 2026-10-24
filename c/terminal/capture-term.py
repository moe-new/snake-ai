"""Record a terminal program's output with its timing, as an asciinema v2 cast: a header line,
then one [seconds, "o", text] line per chunk the program wrote. The program runs in a
pseudo-terminal of the given size, so it draws exactly as it would in a terminal window.

The film's hook plays back a take of record (the 2024 C program's AI, unchanged), made with:
  python3 c/terminal/capture-term.py record.cast -- c/terminal/record --now --games 130"""
import json, os, pty, select, struct, sys, termios, fcntl, time

COLS, ROWS = 64, 36
out_path, cmd = sys.argv[1], sys.argv[sys.argv.index('--') + 1:]
pid, fd = pty.fork()
if pid == 0:
    os.execvp(cmd[0], cmd)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', ROWS, COLS, 0, 0))
chunks, t0 = [], time.monotonic()
while True:
    r, _, _ = select.select([fd], [], [], 1.0)
    if not r:
        continue
    try:
        data = os.read(fd, 1 << 16)
    except OSError:   # the program has exited
        break
    if not data:
        break
    chunks.append((time.monotonic() - t0, data))
_, status = os.waitpid(pid, 0)

# Join the bytes, then cut them back into chunks at their times without splitting a UTF-8 character.
os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
with open(out_path, 'w') as f:
    f.write(json.dumps({'version': 2, 'width': COLS, 'height': ROWS, 'timestamp': int(time.time()),
                        'command': ' '.join(os.path.relpath(c) if os.path.exists(c) else c for c in cmd)}) + '\n')
    pending = b''
    for t, data in chunks:
        pending += data
        text = pending.decode('utf-8', errors='ignore')
        keep = len(pending) - len(text.encode('utf-8'))
        pending = pending[len(pending) - keep:] if keep else b''
        if text:
            f.write(json.dumps([round(t, 6), 'o', text], ensure_ascii=False) + '\n')
print(f'wrote {out_path}: {len(chunks)} chunks, {chunks[-1][0]:.2f} s, exit {os.waitstatus_to_exitcode(status)}')
