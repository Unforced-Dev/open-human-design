# Transit timeline Chinese terminology

This note records translation choices for `src/features/transit-timeline/messages.js`. The two `timeline.json` files use the message **keys** from that module; they do not add UI explanations or alter its calculations.

| English source | zh-CN | zh-Hant | Basis |
| --- | --- | --- | --- |
| Transit / transits | 行运 | 流日 | Existing `ui-transits.json` in the formal language packs uses these terms consistently, including “Birth chart + transits” and “Transit activations”. |
| Birth chart, Design, Personality | 出生图、设计、人格 | 出生圖、設計、人格 | Existing `ui-transits.json` and `ui-common.json`. Here `Design` and `Personality` name the red and black planetary columns, respectively; neither means chart design or personality type. |
| Center, Channel, Gate | 能量中心、通道、闸门 | 能量中心、通道、閘門 | Existing `ui-static.json`, `ui-common.json`, and `ui-transits.json`. The timeline's “activation” is 激活 / 啟動, following the existing transit view. |
| Line fixing | 爻线固定 | 爻線固定 | The Chinese Human Design article [關於爻的說明](https://humandesign.report/%E9%97%9C%E6%96%BC%E7%88%BB%E7%9A%84%E8%AA%AA%E6%98%8E/) uses 爻 and 固定 for a planet fixing a line's polarity. Adding 線 / 线 keeps the UI label recognizable beside other “line” uses in the formal packs. |
| Exaltation `▲` | 上升 | 上升 | The same Chinese Human Design article explicitly pairs ▲ with 上升. [Jovian Archive's line-fixing explanation](https://jovianarchive.com/blogs/chart-interpretations-components/line-fixing-in-human-design-exaltation-detriment-and-juxtaposition) confirms this is one pole of the line's expression, not a moral ranking. |
| Detriment `▽` | 下降 | 下降 | The Chinese article explicitly pairs ▽ with 下降. Jovian Archive identifies it as the other pole. Avoid “失势 / 失勢” here: that word is also used for an astrological planetary dignity and could misstate this line-specific rule. |
| Juxtaposition `✶` | 并列 | 並列 | The Chinese article lists ✶ as 並列. Jovian Archive specifies that, **in line fixing**, this means both the exaltation and detriment poles are fixed at the same time. It is distinct from “Juxtaposition Cross / 並列交叉”, an incarnation-cross term. |
| Unfixed | 未固定 | 未固定 | The Chinese article describes charts with no fixed up/down symbol as 沒有固定的標示. This label does not claim the line lacks both potential poles. |
| Rule awaiting verification | 规则待核实 | 規則待核實 | This is the English source's explicit unknown-rule state, not an alternative for “unfixed”. |

The English feature describes a *time window*, *activation interval*, and *duration within the selected range*. The translations keep those limits visible: clipped bars may extend beyond the displayed range, and the timing estimate is based on one-minute sampling with detected changes refined to one second. The date-time messages distinguish a repeated local time (choose UTC offset) from a nonexistent local time.

The implementation boundary is documented in [`line-fixing-research.md`](line-fixing-research.md): natal fixing, transit-only fixing, and combined birth-plus-transit fixing are separate results; a transit can change a natal line's displayed fixing temporarily. Accordingly, the UI labels say 出生图 / 出生圖, 行运 / 流日, and 出生图＋行运 / 出生圖＋流日. The labels do not present the underlying candidate rule table as independently validated. The rule data's completeness and exact results, especially line 54.4 and conflict cases, remain unconfirmed as recorded in that research note.

Sources reviewed: [Jovian Archive, “Line Fixing in Human Design”](https://jovianarchive.com/blogs/chart-interpretations-components/line-fixing-in-human-design-exaltation-detriment-and-juxtaposition); [Jovian Archive, Human Design Dictionary](https://jovianarchive.com/pages/human-design-dictionary); [關於爻的說明](https://humandesign.report/%E9%97%9C%E6%96%BC%E7%88%BB%E7%9A%84%E8%AA%AA%E6%98%8E/); and the existing formal Chinese locale files noted above. There is no confirmed official Chinese terminology standard for all line-fixing labels; these choices follow the cited Human Design usage and the project's established vocabulary.
