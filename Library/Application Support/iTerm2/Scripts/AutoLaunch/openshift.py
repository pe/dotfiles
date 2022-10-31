#!/usr/bin/env python3.7

import asyncio
import textwrap
import iterm2
# This script was created with the "basic" environment which does not support adding dependencies
# with pip.

COUNTER = 0
#return code for command not found
EX_NOTFOUND = 127
OPENSHIFT_COMMANDS = ["oc login ", "oc logout ", "oc project "]

async def main(connection):
    icon2x = iterm2.StatusBarComponent.Icon(2, "iVBORw0KGgoAAAANSUhEUgAAACAAAAAiCAYAAAA+stv/AAAB0ElEQVR4Ae3SA6xcQRSA4dq2bdtmVNt2g9qNatu2bdu2bbtdnv4b3sxy7r4X3j/5Ysycc6JYWZksO5qjBwahAyojMSKtlBiNZxA/bNiGuoiwomE4fkM07ERGhFVyHIKY9AONYKqo2AcJ4ickABtqQrvBEKjeoidKIwk8ZUZLLIANoviBNliEgQhaeTggBk5MRyIEKjeuQ3Ab/+CEQGALdhuJ8BKi6I1QS4Qi8NQfgo+YhTIIWBuIYgvMFAP1sAAxEVKb1Z0jCXQqiOn4AMEjhFQc/IIYjIduAyGK0ghaDoiiBlJDpzRwmLmhohAI3HDiIn5At7sQg7Xoi0nwWznswEq4IRC4EBM6ncQ3vMI/uCHYhKDVhuAuhiATdCuOODgLMViKgCVFP3RHuCXBX4jBcPisAbbABsE8hFtfiKIgfHYMYvABCWC2Qurv8Rh+awtRrICnGMiMUIuPuxDFIPgtNp5BDGzYiA/4i9YIVklcgigOIxoC1hKvMAYHIVAdREfkVo6tFObCBVG8RxoELSqiw1NCXIYE8BHvIQG4UBOmSoXrEJNs6IawioWRsEE03EcJRFj5sBhfIX64cQktER2RUixUQ1eMxWgMQFOkglZWVv8BVWcaDO4vw3sAAAAASUVORK5CYII=")
    icon1x = iterm2.StatusBarComponent.Icon(1, "iVBORw0KGgoAAAANSUhEUgAAABAAAAARCAQAAAB+puRPAAAA0ElEQVR4Aa3BTyuDARwA4KdNqSW77cDB1U0KFyXlGyw77CgHR7XkpFyEWiFuXFzWysVJSZx9hZ3sMpTyp1yWpZ/a1l5r1z2PIZuxrqxk3ogBk6pCCCHULOmT0xB+3Tpz7V34sWpBV8qDUDerY9yRcy13RrUtCy1zEtP2rek5EG6kJSpCVU/Zm087EhuanlV0pR0qykhkbQuP2la8qEv5L6Mm7Gmb0BSO7crpGHMlfJnSlVfwLXy4tOVEQwh5fRY9CSGE8KpoQEbBqXsXNmUNzR+ScESlOaPFVAAAAABJRU5ErkJggg==")

    app = await iterm2.async_get_app(connection)

    # Register the status bar component.
    component = iterm2.StatusBarComponent(
        short_description="openshift",
        detailed_description="The currently configured project for openshift",
        exemplar="projectname",
        icons=[icon1x,icon2x],
        update_cadence=600,
        identifier="com.openshift",
        knobs=[])

    @iterm2.StatusBarRPC
    async def openshift_coroutine(knobs,
        _=iterm2.Reference("user.openshiftExecuted?"),):
        proc = await asyncio.create_subprocess_shell(
            "oc project -q",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode == EX_NOTFOUND:
            return ''
        if stderr:
            return [f'{textwrap.shorten(stderr.decode(), width=width, placeholder="…")}'
                    for width in [20, 40, 60, 80, 100, 120]]

        return f'{stdout.decode().strip()}'

    await component.async_register(connection, openshift_coroutine)

    async def monitor(session_id):
        """Check for openshift commands and trigger a update"""
        session = app.get_session_by_id(session_id)
        if not session:
            return
        modes = [iterm2.PromptMonitor.Mode.COMMAND_START]
        async with iterm2.PromptMonitor(connection, session_id, modes=modes) as mon:
            while True:
                mode, _ = await mon.async_get()
                if mode == iterm2.PromptMonitor.Mode.COMMAND_START:
                    prompt = await iterm2.async_get_last_prompt(connection, session_id)
                    if any(command in prompt.command for command in OPENSHIFT_COMMANDS):
                        global COUNTER
                        COUNTER += 1
                        await session.async_set_variable("user.openshiftExecuted", COUNTER)

    await iterm2.EachSessionOnceMonitor.async_foreach_session_create_task(app, monitor)

iterm2.run_forever(main)
