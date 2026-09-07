# All News Truth Core — Step 8.2 Architecture

```text
                    ┌─────────────────────┐
                    │   Research Request  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Research Engine   │
                    └──────────┬──────────┘
                               │
                 ┌─────────────┼─────────────┐
                 ▼             ▼             ▼
          Provider A      Provider B     Provider C
          Government       OGD/API        News/Open
                 │             │             │
                 └─────────────┼─────────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Normalize Evidence  │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │   Dedupe Sources    │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Evidence Layer/Core │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Human Editorial Gate│
                    └─────────────────────┘
```

## Truth Core rule

`No source → no factual assertion`

`Source exists → claim must retain evidenceIds`

`Conflicting evidence → contradiction must remain visible`

`AI output ≠ evidence`

## Completion criteria

- [ ] At least one real provider connected.
- [ ] Provider failures are isolated.
- [ ] Returned records normalize into `EvidenceItem`.
- [ ] Duplicate URLs are removed.
- [ ] Research status reflects evidence availability.
- [ ] Authentication remains mandatory.
- [ ] Human review remains mandatory.
- [ ] No auto-publish path exists.
