#!/usr/bin/env python3.7

import asyncio
import re
import os
import iterm2
# This script was created with the "basic" environment which does not support adding dependencies
# with pip.

COUNTER = 0
BRANCH = re.compile(r"## .+ \[(.+)\]")

async def fetch():
    """A background tasks that periodically fetches the remote of the yadm repo"""
    while True:
        proc = await asyncio.create_subprocess_shell(
            "yadm fetch --quiet",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await proc.communicate()
        print("yadm fetch")
        if stdout:
            print(stdout.decode())
        if stderr:
            print(stderr.decode())
        await asyncio.sleep(12 * 60 * 60) #12h

async def main(connection):
    icon2x = iterm2.StatusBarComponent.Icon(2, "iVBORw0KGgoAAAANSUhEUgAAACAAAAAiCAQAAACUuxN0AAAA9UlEQVR42mNgGAXoQJ3hGsMLLPAJw3QGYcLadRheMLxjeIwGXzH8Z/jH8J/hAmEjGhj+MyRjiFow/GfYwbCeGCNwG7CZgY1hM2Ej8BnAwMDOsJ2QEfgNYGDgYNiN3whCBjAwcDHsZ/jPsI10Ay4xZEBhCcNXhv8MCqQagA6NSTFAjCEZBV4h1QB0sIOuBogyuDOYM7CQa0AgwxdwkJ1lECTHABaGN/BQ7yLHAGWkaNtLjgH8SAYsJy8MpkC1f2MwJzcWtBhaGJIY+AYwHYw8A4IY/jEcZphDAD5heMUgicv0TCyFBzp8xaCDz4E2DP4EoNIwq40BPdXJrReYsrUAAAAASUVORK5CYII=")
    icon1x = iterm2.StatusBarComponent.Icon(1, "iVBORw0KGgoAAAANSUhEUgAAABAAAAARCAQAAAB+puRPAAAAhElEQVR42mNgoBbgYNCAQz5sCnYwrIPCVwxPGBwwFTyEs/YweDBcYvDAp0CDQZLhLIMLbgV3Ga4zPGFYjksBCwMrAyuDA8MKXAogwAaXAgeGTgYt3ApYGd4y/GfYj8+Emwz/wc7DqYCHwY6BFZ8CnI5cxnARBd5kCENVwMwgjAIFiI5mAAATLDH7OeagAAAAAElFTkSuQmCC")

    # periodically fetch the remote of the yadm repo
    asyncio.create_task(fetch())

    app = await iterm2.async_get_app(connection)

    # Register the status bar component.
    component = iterm2.StatusBarComponent(
        short_description="yadm",
        detailed_description="Shows if there are changes to a yadm managed home directory",
        exemplar="1 ahead commits – 2 files changed",
        icons=[icon1x,icon2x],
        update_cadence=600,
        identifier="io.yadm",
        knobs=[])

    @iterm2.StatusBarRPC
    async def yadm_coroutine(knobs,
            _=iterm2.Reference("user.yadmExecuted?"),):
        proc = await asyncio.create_subprocess_shell(
            "yadm --no-optional-locks status --untracked-files=no --branch --porcelain",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if stderr:
            return stderr.decode().strip()

        lines = stdout.decode().splitlines()
        match = re.match(BRANCH, lines[0])
        ahead_behind = f'{match.group(1)} commits' if match else ""
        paths = [line[3:].strip(' "') for line in lines[1:]]
        filenames = [os.path.basename(path) for path in paths]
        file_count = f"{len(paths)} files changed" if paths else ""
        if paths or ahead_behind:
            return [" – ".join(filter(None, [ahead_behind, " ".join(paths)])),
                    " – ".join(filter(None, [ahead_behind, " ".join(filenames)])),
                    " – ".join(filter(None, [ahead_behind, file_count]))]
        return "clean"

    await component.async_register(connection, yadm_coroutine)

    async def monitor(session_id):
        """Check for yadm commands and trigger a update"""
        session = app.get_session_by_id(session_id)
        if not session:
            return
        modes = [iterm2.PromptMonitor.Mode.COMMAND_START]
        async with iterm2.PromptMonitor(connection, session_id, modes=modes) as mon:
            while True:
                _, command = await mon.async_get()
                if "yadm " in command:
                    global COUNTER
                    COUNTER += 1
                    await session.async_set_variable("user.yadmExecuted", COUNTER)

    await iterm2.EachSessionOnceMonitor.async_foreach_session_create_task(app, monitor)

iterm2.run_forever(main)
