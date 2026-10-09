"""Isolated, bounded scraper execution; killing a wait never leaves a source running."""
import importlib
import multiprocessing
import json
import logging
import os


class SourceFailure(RuntimeError):
    pass


class SourceObservations(list):
    """Preserve existing list consumers while carrying an honest source outcome."""
    def __init__(self, items, source_status):
        super().__init__(items)
        self.source_status = source_status


class _WarningCounter(logging.Handler):
    def __init__(self):
        super().__init__(logging.WARNING)
        self.warnings = 0
        self.errors = 0

    def emit(self, record):
        self.warnings += 1
        self.errors += int(record.levelno >= logging.ERROR)


def _collect(connection, module, function, kwargs, allow_enrichment):
    if not allow_enrichment:
        os.environ["ENABLE_GEOCODING"] = "false"
    counter = _WarningCounter()
    logging.getLogger().addHandler(counter)
    try:
        items = getattr(importlib.import_module(module), function)(**kwargs)
        if not isinstance(items, list):
            raise TypeError("Expected list of observations")
        if len(items) > 2000:
            raise ValueError("Source result budget exceeded")
        if len(json.dumps(items, default=str).encode()) > 8_000_000:
            raise ValueError("Source payload budget exceeded")
        status = getattr(items, "source_status", "ok" if items else "empty_unconfirmed")
        if counter.warnings:
            status = "partial" if items else "error" if counter.errors else "empty_unconfirmed"
        connection.send({"items": list(items), "status": status})
    except Exception as error:
        # Exception text can contain source URLs or credentials.
        connection.send({"error": type(error).__name__})
    finally:
        logging.getLogger().removeHandler(counter)
        connection.close()


def bounded_scrape(module, function, kwargs=None, timeout=90, allow_enrichment=True):
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(target=_collect, args=(sender, module, function, kwargs or {}, allow_enrichment), daemon=True)
    process.start()
    sender.close()
    try:
        if not receiver.poll(timeout):
            raise SourceFailure("source_timeout")
        try:
            result = receiver.recv()
        except EOFError as error:
            raise SourceFailure("source_process_failed") from error
        if result.get("error"):
            raise SourceFailure(result["error"])
        return SourceObservations(result["items"], result["status"])
    finally:
        if process.is_alive():
            process.terminate()
        process.join(timeout=3)
        if process.is_alive():
            process.kill()
            process.join(timeout=3)
        receiver.close()
