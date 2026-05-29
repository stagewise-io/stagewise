# Problem

Our coding agent interacts with dynamic environments whose moving parts change over time - e.g. a browser with tabs 1, 2 and 3 can change to only have tabs 2, 3. Or some shell session exists at t_0 but is killed externally at t_1.

We need a way to efficiently communicate this state and any state-changes to the agent while considering disk space, (KV-)cache-efficiency and prompt-effectiveness.

# Solution

The idea is to render a full `envState` everytime we start a new (or newly compressed) conversation with a coding agent to communicate the full state, and subsequently render an `envChange` whenever the state has changed related to the known state (a tab was closed, session killed, etc.)

# Terminology

- `domain` - A contextual coherent domain that owns a slice of the full state, e.g. 'browser', 'shell' or 'todos'. 
- `state` - A typed object that represents the full state of a domain, e.g. for browser: 

```JSON
{ openTabs: { 1: { title: 'Test website', url: 'http://localhost:3000' }, 2: { title: 'Google', url: 'https://google.com' } }, activeTabId: '1' }
```

- `renderedState` - An LLM-readable stringified version of the full `state`, e.g. `JSON.stringify(state)`
- `renderedStateChange` An LLM-readable stringified diff between the previous state and the now-changed state, e.g. `Tab '2' is now the activeTab`, computed via `renderStateChange(state_t-1, state_t)` where `state_t-1` != `state_t`.


# Implementation

Each environment (or `host` as it's still called rn) provides a function `host.getState` which returns a live `state` per domain.

Agent-core can, for each domain, get the liveState on each message turn and, if `state_t` !- `state_t-1`, save it into persistence on the agent-message. When agent-core prepares the next LLM-call, it will run `host.renderState(state_t, state_t-1)` which will return a `renderedStateChange` (or a `renderedState` if state_t-1 === null).

By simply comparing to previously known state, agent-core will always render 'the correct' state (changes) from the LLMs perspective. Compression will work out of the box (by simply rendering a new `state` since the previous `state` will not be included in the LLM messages) and message reverting will also simply render the correct changes compared to the previously known state, based on the updated `liveState`. 


# Caveats

With the given implementation, agent-core will always depend on a connected environment/ host to render messages. This is okay for fully local applications and assuming that environments will never be disconnected during the lifetime of an agent - but it will become problematic once environments will also work remotely (adds latency to each call) or can be disconnected (`state` cannot be rendered any longer).

Workaround for the latency problem:
Environments can simply push the liveState to agent-core (instead of `agent-core` always pulling the sate), so that `agent-core` can simply pick up what it has received so far. Requires bidirectional connection (e.g. websockets).

Workaround for the `missing-renderer` problem:
`Agent-core` can simply save the `renderedState` **and** the `renderedStateChange` alongside the structured `state` - and when the environment is disconnected, `agent-core` can either simply reuse the `renderedStateChange` to render the changes, or the `renderedState` if the chat receives compression.

