Agent as Policy for Robotic Manipulation (AGP) - per-trial data
===============================================================

These files carry every number shown on the project page, at the precision the
analysis produced. Rounding happens only when a value is displayed.

Tables as printed in the paper
  table1_rendered.csv   main results, one row per task configuration
  table2_rendered.csv   agent, model and thinking-effort comparison on two pair assembly
  table6_summary.csv    where the execution time goes, per configuration

Per trial
  table1_metrics.csv    the 62 main-results trials
  table2_metrics.csv    the 40 model-comparison slots (blank resource cells where the
                        study reports no accounting for a trial)
  transfer_metrics.csv  the 10 experience-transfer trials
  trials.csv            all 112 counted slots in one table
  trials.json           the same, with the definitions and the summary counts

Experience reuse
  ring_metrics.csv                  ring disassemble/assemble, cycles 1-5
  twopairs_experience_metrics.csv   two pair assembly, cycles 1-5
  transfer_summary.csv              a smaller model with and without a transferred
                                    experience store

Definitions
  Success             a person reviewed the final images and decided whether the task
                      was achieved. Means and ranges cover successful trials only;
                      Success counts cover all trials.
  Time (min)          task start to the final report write, including the terminal
                      verification step.
  Tokens (k)          thousands of tokens: input including cached, plus output
                      including reasoning.
  Cost (USD)          standard published API rates, priced per request.
  label_confidence    how the agent's own report reads: explicit success, explicit
                      failure, unclear (a report exists but states no outcome a fixed
                      parser can extract), or no report (the run ended without one).
  self_report_        yes only where the agent's report states an outcome opposite to
   disagrees_with_    the audited one. "unclear" and "no report" are never
   audit              disagreements; they are limits of the record.
  session_stamp       the session start stamp, YYYYmmdd_HHMMSS.

The experience-transfer study (transfer_metrics.csv, transfer_summary.csv) was
collected on 11 September 2026, after the preprint snapshot, and is newer than the
corresponding figure in the paper.

Resource values are machine-checked against the paper's own tables. The Success
counts for GPT-5.6 Terra, GPT-5.6 Luna and Claude Fable 5.1 are author attestations:
those runs have no per-trial accounting on file.

Table 1 selection updated 13 September 2026. Four pair assembly uses trials 01 through
10 from the single-arm batch, with the second execution of trial 09. Trial 05 ended
at the time limit and counts as unsuccessful. Failed-trial times end at the final
report boundary or termination. Resource summaries use successful trials only.
The source CSV stores tokens in thousands, as indicated by tokens_k.
