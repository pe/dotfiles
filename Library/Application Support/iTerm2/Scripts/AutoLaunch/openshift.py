#!/usr/bin/env python3.7

import asyncio
from asyncio.subprocess import PIPE
import textwrap
import time
import iterm2

EX_NOTFOUND = 127 #return code for command not found
OPENSHIFT_COMMANDS = ["oc login ", "oc logout", "oc project "]
ICON_1X = iterm2.StatusBarComponent.Icon(1, "iVBORw0KGgoAAAANSUhEUgAAABAAAAARCAQAAAB+puRPAAAA0ElEQVR4Aa3BTyuDARwA4KdNqSW77cDB1U0KFyXlGyw77CgHR7XkpFyEWiFuXFzWysVJSZx9hZ3sMpTyp1yWpZ/a1l5r1z2PIZuxrqxk3ogBk6pCCCHULOmT0xB+3Tpz7V34sWpBV8qDUDerY9yRcy13RrUtCy1zEtP2rek5EG6kJSpCVU/Zm087EhuanlV0pR0qykhkbQuP2la8qEv5L6Mm7Gmb0BSO7crpGHMlfJnSlVfwLXy4tOVEQwh5fRY9CSGE8KpoQEbBqXsXNmUNzR+ScESlOaPFVAAAAABJRU5ErkJggg==")
ICON_2X = iterm2.StatusBarComponent.Icon(2, "iVBORw0KGgoAAAANSUhEUgAAACAAAAAiCAYAAAA+stv/AAAB0ElEQVR4Ae3SA6xcQRSA4dq2bdtmVNt2g9qNatu2bdu2bbtdnv4b3sxy7r4X3j/5Ysycc6JYWZksO5qjBwahAyojMSKtlBiNZxA/bNiGuoiwomE4fkM07ERGhFVyHIKY9AONYKqo2AcJ4ickABtqQrvBEKjeoidKIwk8ZUZLLIANoviBNliEgQhaeTggBk5MRyIEKjeuQ3Ab/+CEQGALdhuJ8BKi6I1QS4Qi8NQfgo+YhTIIWBuIYgvMFAP1sAAxEVKb1Z0jCXQqiOn4AMEjhFQc/IIYjIduAyGK0ghaDoiiBlJDpzRwmLmhohAI3HDiIn5At7sQg7Xoi0nwWznswEq4IRC4EBM6ncQ3vMI/uCHYhKDVhuAuhiATdCuOODgLMViKgCVFP3RHuCXBX4jBcPisAbbABsE8hFtfiKIgfHYMYvABCWC2Qurv8Rh+awtRrICnGMiMUIuPuxDFIPgtNp5BDGzYiA/4i9YIVklcgigOIxoC1hKvMAYHIVAdREfkVo6tFObCBVG8RxoELSqiw1NCXIYE8BHvIQG4UBOmSoXrEJNs6IawioWRsEE03EcJRFj5sBhfIX64cQktER2RUixUQ1eMxWgMQFOkglZWVv8BVWcaDO4vw3sAAAAASUVORK5CYII=")

async def calculate():
    """Returns the current active openshift project"""
    proc = await asyncio.create_subprocess_shell("oc project -q", stdout=PIPE, stderr=PIPE)
    stdout, stderr = await proc.communicate()
    if proc.returncode == EX_NOTFOUND:
        return ''
    if stderr:
        stderr_decoded = stderr.decode()
        if "(Unauthorized)" in stderr_decoded:
            return 'Not logged in'
        return [f'{textwrap.shorten(stderr_decoded, width=width, placeholder="…")}'
                for width in [20, 40, 60, 80, 100, 120]]

    return f'{stdout.decode().strip()}'

async def main(connection):
    component = iterm2.StatusBarComponent(
        short_description="openshift",
        detailed_description="The current active openshift project",
        exemplar="projectname",
        icons=[ICON_1X, ICON_2X],
        update_cadence=None,
        identifier="com.openshift",
        knobs=[])

    app = await iterm2.async_get_app(connection)

    async def update():
        """A background tasks that periodically updates the status bar."""
        while True:
            print("Updating")
            await app.async_set_variable("user.openshift", await calculate())
            await asyncio.sleep(10 * 60) #10min
    asyncio.create_task(update())

    @iterm2.StatusBarRPC
    async def coroutine(knobs, value=iterm2.Reference("iterm2.user.openshift?"),):
        return value if value else ""
    await component.async_register(connection, coroutine)

    async def monitor(session_id):
        """Check for oc commands and update the status bar."""
        session = app.get_session_by_id(session_id)
        if not session:
            return
        modes = [iterm2.PromptMonitor.Mode.COMMAND_START]
        async with iterm2.PromptMonitor(connection, session_id, modes=modes) as mon:
            while True:
                _, command = await mon.async_get()
                if any(openshift_command in command for openshift_command in OPENSHIFT_COMMANDS):
                    await asyncio.sleep(1)
                    await app.async_set_variable("user.openshift", time.time())
    await iterm2.EachSessionOnceMonitor.async_foreach_session_create_task(app, monitor)

iterm2.run_forever(main)
