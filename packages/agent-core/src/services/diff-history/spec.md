Note: **Never** let an agent modify this file without careful review, this is **not** generated.

# Diff history

In the stagewise application, coding agents can perform file edits via tool calls.

To allow users to see, accept, reject, undo and redo single edits at any given time, we need a persistent, reliable system that provides exactly this functionality.

Inspired by git, we will use a content-addressed, snapshot-based system that stores (compressed) snapshots in a table of an sqlite db, and tracks edits in an 'operations'-table that references those snapshots.

## Terminology
- Snapshot: content-addressed stored file state
- Current content (of a file): The file state on disk
- Baseline: state of a file which all diffs will compare to


## The environment of the diff-system
The environment that will interact with the diff-system is the following:

- 1 user (can perform file-edits, can accept/ reject pending edits, can restore previous file-states)
- N agents (can perform file-edits via tool-calls with distinct tool-call ids)
- M files (the subjects of the file edits)

The diff-system is only involved for files if an agent has edited those.

## Requirements of the diff-system, based on workflows:

### 1. Viewing/ accepting/ rejecting pending edits
After an agent has performed an edit to a file (which will immediately be saved to disk), the edit is pending. Now, the user can:
- (A) View pending edits:
    - The user will be able to see all pending edits. The diff of the edits will be compared to a baseline, which initially is the current content of the file before the edit. The baseline will only alter when the user accepts edits.
- (B) Accepting an edit:
    - The user will be able to accept hunks of a pending edit. This will update the baseline to include the accepted hunk. 'Accepting' does not modify the current content of a file.
- (C) Rejecting an edit:
    - The user will be able to reject hunks of a pending edit. This will 'undo' this hunk in the current content of the file and restore the content of the baseline hunk (so, it performs a write operation on the disk).

### 2. Reverting/ Redoing agent edits
The user will be able to revert agent-edits. Since, in our app, agent-edits are scoped to tool-calls, the user would say 'restore the state to before this tool-call'. 
- (A) Reverting agent edits:
    - When the user says 'restore the state to before this tool-call', the system must restore the contents of the files that have been present at this point in time. The system must also restore the 'pending-edits'-context to this point of time, so that the user can accept/ reject the edits again.
- (B) Redoing agent edits:
    - When the user says 'redo the agent-edits' after he has previously reverted those edits, the system must be able to redo the reverted edits and restore the content of the file and the 'pending-edits'-context.

### 3. Viewing edit-summaries per chat
Regardless of the state of pending edits, the system must be capable to give the user a summary of 'modified files' in the history of a chat. The summary must answer the question: 'Which files have been affected by agent-edits in this chat and what are the resulting diffs?'

### 4. Showing contributions in diffs (pending-edits and summary)
Since the environment of the system involves multiple contributors to file edits (N agents, 1 user), the system must be able to tell which contributor is responsible for which part of a diff (e.g. in the pending edits of 'readme.md', agent 1 contributed hunk A, agent 2 contributed hunk B and the user contributed hunk C).

(a) To prove that all requirements are met, it is sufficient to prove that the requirements are met for a single-file environment. All operations of the requirements only affect a single file at a time, and thus, if a system A can be found that solves all requirements for a single-file environment, one can simply create a system B that includes a system A for each file in its environment.

## Base diff system (meets requirements 1A, 1B, 1C, 2A, 2B)

### Table/ Data structure

The base system contains two tables - 'snapshots' and 'operations'. 

#### snapshots - includes all content-addressed snapshots 

- oid (text): the payload hash that addresses the snapshot
- payload (blob): the content of the snapshot

example:
| oid  | payload           |
----------------------------
| 0aen | 'aklsdf90234afkd' | 
| ay2j | 'hllsdfpw9023k23' | 
| bcel | 'o23hzd09akwdlkf' | 
| asdj | 'af9p8ajk3rhrajh' | 

Note: To simplify the spec, we don't include any performance-related improvements - the production table might use compression and delta-compression for more efficient storing. It will probably also extend the snapshots db to include LFS (large file storage) support for binaries, etc.


#### operations - a sequential list of operations, such as agent-edits, user-edits and changes to the baseline - references snapshots via oid

- idx (number): an incremental number that represents the sequence of the operations (0 is the first operation of the system, n is the latest). **The system only appends rows**, it never mutates, inserts or deletes a row.
- filepath (text): an absolute path to the subjected file
- operation (text): 'baseline' or 'edit'
    - baseline: the latest baseline points to the snapshot that all diffs compare to
    - edit: the latest edit for a file represents the latest tracked content of the file on disk (if the file is currently tracked, it's the content on disk)
- snapshot_oid (text, references snapshots.oid): points to the snapshot the operation refers to

example:
| idx | filepath     | operation  | snapshot_oid |
--------------------------------------------------
| 0   | /readme.md   | 'baseline' | 0aen         |
| 1   | /readme.md   | 'edit'     | ay2j         | <- first agent edit
| 2   | /readme.md   | 'edit'     | bcel         | <- another agent edit (or reject by user)
| 3   | /readme.md   | 'baseline' | asdj         | <- partial accept
| 4   | /readme.md   | 'baseline' | bcel         | <- accepted all, session ended

All of the requirements (1A, 1B, 1C, 2A, 2B) can be met by appending 'baseline' or 'edit' rows to the 'operations' table (and by adding the related snapshots to the snapshots table).

### Meeting requirements 1A, 1B, 1C, 2A, 2B with the base system:

Definitions/ Terminology:
- readme.md := filepath under subject
- b_n := latest 'baseline' row for filepath
- b_i for any i := 'baseline' row with idx i
- e_n := latest 'edit' row for filepath
- e_i for any i := 'edit' row with idx i
- 'e_j == b_k' for any row in operations is defined as 'snapshot_oid of e_j == snapshot_oid of b_k'
- 'Pending edit' := An agent has changed hunks in a file that were neither rejected nor accepted.

Preamble:
For every agent-edit to readme.md, the system will:
- If no pending edits for readme.md are present: append a 'baseline' row with the content before the edit (creates the initial baseline)
- Always: append an 'edit' row with the post-edit content (captures the edit)

For every user-edit to readme.md, the system will:
- If no pending edits for readme.md are present: do nothing
- Else: append an 'edit' row with the post-edit content (captures the edit)

1A (view pending edits for readme.md):
- diff(e_n, b_n) (if e_n == b_n: there are no pending edits, baseline == latest state)
- Note: b_n is the **latest** baseline, which may be an accept baseline (from 1B) after a partial accept, not necessarily the init baseline. After a partial accept, pending diffs must only show changes since the last accept, not since the original init.
1B (accept a pending edit for readme.md):
- append a 'baseline' row with the content of (b_n + accepted hunk)
1C (reject a pending edit for readme.md):
- insert an 'edit' row with the content of (e_n - rejected hunk) and write to disk
2A (reverting to the edit e_i):
- copy rows e_i up to the previous baseline, append them to the end of the table and write content of e_i to disc (this will restore the content of e_i **and** show the baseline that existed at the time of e_i)
2B (redoing all edits to edit e_j):
- same as 2A

Operators:
**diff(e, b): Diffing content:**
- diff(e, b) creates a diff of the snapshot e against the baseline b

Functions:
Find the end of a session:
**(#A) For any b_i in the session:**
    - if immediate previous e (e_i) == b_j: b_j is the end (b_i accepted e_j)
    - else if immediate next e (e_k) == b_j: e_k is the end (e_k reverted to b_j)
    - else if b_i+1 exists: go to b_i+1, repeat with b_i+1
    - else: session hasn't ended yet

**(#B) For any e_i in the session:**
    - go to immediate previous b (b_h), enter (A) with b_h (the previous b_h of an edit can **never** be the end of a session)

Find the start of a session:
Go up all previous baselines and check the end of their session, until the index of the end of their session is smaller than i! The next baseline after the end of this session is the start of the session of b_i (sessions always start with a new baseline).
**(#C) for any b_i:**
    - for j=1, j++:
        - if b_i-j exists:
            - if index of 'end-of-session'(b_i-j) < i: b_j+1 is the start of the session
        else: start of the session is b_0
    - else: b_i is the start of the session

**(#D) for any e_i:**
    - go to immediate previous b (b_h), enter (#C) with b_h

Get a 'diff-summary' for a session (all edits that were accepted):
**(#D) For any b_i or e_i in a session:**
    - Get start of session b_h via (#C) or (#D)
    - Get end of session o_j (either e_j or b_j) via (#A) or (#B)
    - If o_j is an 'edit': Return 'diff(o_j, b_h)'
    - Else: Get immediate previous edit e_x and Return 'diff(e_x, b_h)'


## Extended diff system (meets requirements 1A, 1B, 1C, 2A, 2B, 3, 4)

Since the base system doesn't include any information about contributors of edits, it's not sufficient to meet requirement 3 (viewing diff summaries per chat-id) or requirement 4 (show contributor for each hunk in a diff). Also, in the real application, users want to revert to messages by specifying a tool-call id - while the base system only supports reverting to a specific index.

Thus, the extended system extends the operations-table by two columns, while the operations table remains the same. Note: This is purely a design decision - the extended system could have also introduced a new table for 'attributions' and a foreign key that connects an attribution with an operation. We will proceed with the extended table for the sake of simplicity.

The new columns are 'reason' and 'contributor':
- reason (text): 'init', {tool-call-id}, 'accept', 'reject'
    - 'init': Initial baseline rows that mark the start of a session
    - {tool-call-id}: Edit rows that contain an agent-edit, affected by the tool-call with {tool-call-id} (loose reference; the tool-calls might be deleted)
    - 'accept': Baseline rows that accept a hunk in a session
    - 'reject': Edit rows that reject a hunk in a session
- contributor: {chat-id} or 'user'
    - {chat-id} references the chat that performed an edit (loose reference; the chat might be deleted)
    - 'user' marks edits performed by a user and all baseline rows (does **not** contain new information - 'baseline' and 'reject-edit' rows are always contributed by a user)

While the reasons 'init', 'accept' and 'reject' are functionally not required to meet the requirements, they are handy for various reasons (e.g. finding the beginning of a session more efficiently, counting all accepted hunks by a user, ...).
The contributor-value 'user' is completely inferable and does **not** contain any new information. It is just less ugly than a null value.

operations (example):
| idx | filepath     | operation  | reason       | snapshot_oid | contributor |
-------------------------------------------------------------------------------
| 0   | /readme.md   | 'baseline' | 'init'       | 0aen         | 'user'      |
| 1   | /readme.md   | 'edit'     | 'tool-u209'  | ay2j         | 'chat-183'  |
| 2   | /readme.md   | 'edit'     | 'reject'     | bcel         | 'user'      |
| 3   | /readme.md   | 'edit'     | 'tool-u901'  | aoff         | 'chat-183'  |
| 4   | /readme.md   | 'baseline' | 'accept'     | asdj         | 'user'      |
| 5   | /readme.md   | 'edit'     | 'reject'     | r2jf         | 'user'      |
| 6   | /readme.md   | 'baseline' | 'init'       | 0aen         | 'user'      | 
| 7   | /readme.md   | 'edit'     | 'tool-u209'  | ay2j         | 'chat-183'  | <- REVERT to this tool-call! Needs to copy everything until previous baseline to restore the baseline and all contributions.
| 8   | /readme.md   | 'baseline' | 'accept'     | ay2j         | 'user'      | <- accepted all, session ended


### Meeting requirements 3, 4 with the extended system:

Definitions/ Terminology (extends base-system terminology):
- readme.md := filepath under subject
- chat-1, chat-2 := chats under subject

Operators:
**blame(e_1, e_2, ..., e_x, c, b):**
- blame(e_1, ..., e_x, c, b) returns hunks with blame for each contributor for the diff of the content c against the baseline b, based on edits e_1, ..., e_x

3 (viewing edit-summaries for chat-1 for readme.md, aka which agent edits where accepted in chat-1):
- find all sessions for 'readme.md' that have an edit with contributor=='chat-1' (search for 'init'-baseline)
- for each session with init-baseline b_s and latest edit of session e_s and the (global) current disk content c_n:
    - Get all edits e_1, e_2, ..., e_s from start of session until end of session
    - Compute blame(e_1, e_2, ..., e_s, b_s, c_n) and filter for 'chat-1's contributions -> returns 'surviving' hunks of 'chat-1'
    - append hunks
4 (showing contributions in pending-edits for 'readme.md'):
- Same as 3 but only with latest session - and return all contributions

### Removal attribution

The contributor map (`buildContributorMap`) tracks not only which contributor is responsible for each surviving line (`lineMap`), but also which contributor removed each baseline line that no longer exists (`removalMap`). This is achieved by maintaining a parallel `lineBaselineOrigin` array during the sequential operation replay: each entry records the original 0-indexed baseline position of that line, or `null` if the line was added after the baseline. When a line with a non-null baseline origin is spliced out during replay, the removal is recorded as `removalMap[baselinePosition] = contributor`. This enables correct blame for removed lines in diffs — if an agent deleted a line, the removed line is attributed to that agent, not to `'user'`.