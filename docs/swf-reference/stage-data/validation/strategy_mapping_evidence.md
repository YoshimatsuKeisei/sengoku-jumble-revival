# Formation strategy raw-code mapping

The five raw strategy digits occurring in `fmdt()` are mapped as follows:

| raw | strategy |
|---:|---|
| 0 | 乱戦 |
| 1 | 突撃 |
| 3 | 守備 |
| 4 | 待機 |
| 8 | 迎撃 |

`shk()` preprocesses raw 0 -> 10 and raw 4 -> 14 before incrementing the internal state; the corresponding `chpr(..., dfstp)` values are 10 and 14. Raw 1/3/8 remain 1/3/8 for `dfstp`.

The Japanese labels for raw 3 vs 8 are cross-validated against fixed famous-unit slots and archived community data:
- `efm113` 和田惟政 is in an `fmdt` slot with raw=3; archived famous-unit data labels his 作行 as 守備.
- `efm113` 細川藤孝 / 足利義昭 and `efm99` 姉小路頼綱 are in raw=8 slots; archived famous-unit data labels their 作行 as 迎撃.

Supporting archive page:
https://w.atwiki.jp/kakutokutai/pages/38.html
