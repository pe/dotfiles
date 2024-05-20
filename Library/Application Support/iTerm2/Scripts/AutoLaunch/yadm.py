#!/usr/bin/env python3.7

import asyncio
from asyncio.subprocess import PIPE
import re
import os
import iterm2

BRANCH = re.compile(r"## .+ \[(.+)\]")
ICON_1X = iterm2.StatusBarComponent.Icon(1, "iVBORw0KGgoAAAANSUhEUgAAABAAAAARCAQAAAB+puRPAAAAhElEQVR42mNgoBbgYNCAQz5sCnYwrIPCVwxPGBwwFTyEs/YweDBcYvDAp0CDQZLhLIMLbgV3Ga4zPGFYjksBCwMrAyuDA8MKXAogwAaXAgeGTgYt3ApYGd4y/GfYj8+Emwz/wc7DqYCHwY6BFZ8CnI5cxnARBd5kCENVwMwgjAIFiI5mAAATLDH7OeagAAAAAElFTkSuQmCC")
ICON_2X = iterm2.StatusBarComponent.Icon(2, "iVBORw0KGgoAAAANSUhEUgAAACAAAAAiCAQAAACUuxN0AAAA9UlEQVR42mNgGAXoQJ3hGsMLLPAJw3QGYcLadRheMLxjeIwGXzH8Z/jH8J/hAmEjGhj+MyRjiFow/GfYwbCeGCNwG7CZgY1hM2Ej8BnAwMDOsJ2QEfgNYGDgYNiN3whCBjAwcDHsZ/jPsI10Ay4xZEBhCcNXhv8MCqQagA6NSTFAjCEZBV4h1QB0sIOuBogyuDOYM7CQa0AgwxdwkJ1lECTHABaGN/BQ7yLHAGWkaNtLjgH8SAYsJy8MpkC1f2MwJzcWtBhaGJIY+AYwHYw8A4IY/jEcZphDAD5heMUgicv0TCyFBzp8xaCDz4E2DP4EoNIwq40BPdXJrReYsrUAAAAASUVORK5CYII=")

async def calculate():
    """The status of a yadm managed home."""
    command = "yadm --no-optional-locks status --untracked-files=no --branch --porcelain"
    proc = await asyncio.create_subprocess_shell(command, stdout=PIPE, stderr=PIPE)
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
    return ""

async def main(connection):
    component = iterm2.StatusBarComponent(
        short_description="yadm",
        detailed_description="The status of a yadm managed home.",
        exemplar="1 ahead commits – 2 files changed",
        icons=[ICON_1X, ICON_2X],
        update_cadence=None,
        identifier="io.yadm",
        knobs=[])

    app = await iterm2.async_get_app(connection)

    async def fetch():
        """A background task that periodically fetches the yadm repo."""
        while True:
            command = "yadm fetch --quiet"
            proc = await asyncio.create_subprocess_shell(command, stdout=PIPE, stderr=PIPE)
            stdout, stderr = await proc.communicate()
            print("yadm fetch")
            if stdout:
                print(stdout.decode())
            if stderr:
                print(stderr.decode())
            await asyncio.sleep(12 * 60 * 60) #12h
    asyncio.create_task(fetch())

    async def update():
        """A background tasks that periodically updates the status bar."""
        while True:
            print("Updating")
            await app.async_set_variable("user.yadm", await calculate())
            await asyncio.sleep(10 * 60) #10min
    asyncio.create_task(update())

    @iterm2.StatusBarRPC
    async def coroutine(knobs, value=iterm2.Reference("iterm2.user.yadm?")):
        return value if value else ""
    await component.async_register(connection, coroutine)

    async def monitor(session_id):
        """Listen for yadm commands and trigger an update"""
        session = app.get_session_by_id(session_id)
        if not session:
            return
        modes = [iterm2.PromptMonitor.Mode.COMMAND_START]
        async with iterm2.PromptMonitor(connection, session_id, modes=modes) as mon:
            while True:
                _, command = await mon.async_get()
                if "yadm " in command:
                    await asyncio.sleep(1)
                    await app.async_set_variable("user.yadm", await calculate())
                    print("Var set from command")
    await iterm2.EachSessionOnceMonitor.async_foreach_session_create_task(app, monitor)

iterm2.run_forever(main)
