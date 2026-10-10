from common import APP
import os


class ScanLock:
    """A kernel-managed lock; even a killed process releases it automatically."""
    def __enter__(self):
        self.file = (APP / ".cache/scan.lock").open("a+b")
        self.file.seek(0, 2)
        if self.file.tell() == 0:
            self.file.write(b"1")
            self.file.flush()
        self.file.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.acquired = True
        except OSError:
            self.acquired = False
        return self.acquired

    def __exit__(self, *args):
        self.file.close()
