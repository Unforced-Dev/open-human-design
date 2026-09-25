# PR #4–#6 中文化增補對照

原文基準：#4 `feff501`、#5 `eef0e32`、#6 `64c0542`，個人整合快照 `45ecec6`。此工作在獨立準備分支，未合入 personal/custom、時間軸或原有 PR。沿用正式詞典的簡／繁術語選擇。

「出生圖」與既有「本命圖」指同一份固定的 natal chart；「僅行運／僅流日」不代表出生圖被改寫。夏令時跳時提示僅說明當地時間不存在，不擅自歸因所有歷史時差調整；回撥時保留兩個 UTC 選項的精確值。IANA 識別碼、UTC、ISO 時刻、秒數和通道編號不翻譯。顏色名稱不寫死在文案，青色 `#1AADB7` 與 CSS 配色保持 PR #6 原樣。

| English source | 简体中文 | 繁體中文 |
|---|---|---|
| Time | 时间 | 時間 |
| Seconds | 秒 | 秒 |
| Include seconds | 精确到秒 | 精確到秒 |
| Timezone | 时区 | 時區 |
| Now | 现在 | 現在 |
| Choose UTC offset | 选择 UTC 时差 | 選擇 UTC 時差 |
| e.g. Europe/London | 例如 Europe/London | 例如 Europe/London |
| Enter a valid date and time. | 请输入有效的日期和时间。 | 請輸入有效的日期與時間。 |
| Enter a valid IANA timezone. | 请输入有效的 IANA 时区。 | 請輸入有效的 IANA 時區。 |
| This local time does not exist in that timezone. Choose another time. | 该时区不存在这个当地时间，请选择其他时间。 | 該時區不存在這個當地時間，請選擇其他時間。 |
| Chart view | 图表视图 | 圖表檢視 |
| Birth chart + transits | 出生图＋行运 | 出生圖＋流日 |
| Transit only | 仅行运 | 僅流日 |
| Activation sources | 激活来源 | 啟動來源 |
| Birth activations | 出生图激活 | 出生圖啟動 |
| Transit activations | 行运激活 | 流日啟動 |
| Transit gates | 行运闸门 | 流日閘門 |
| Gates added by transit | 行运新增的闸门 | 流日新增的閘門 |
| Birth + transit gates | 出生图与行运共同激活的闸门 | 出生圖與流日共同啟動的閘門 |
| Transit-defined center | 行运定义的中心 | 流日定義的中心 |
| Center defined with transits | 叠加行运后定义的中心 | 疊加流日後定義的中心 |
| Birth chart | 出生图 | 出生圖 |
| Completed by transit | 由行运补全 | 由流日補全 |
| Birth chart + transit | 出生图＋行运 | 出生圖＋流日 |
| Inactive | 未激活 | 未啟動 |
| Transit | 行运 | 流日 |
| Bodygraph details | 人体图详情 | 人體圖詳情 |
| Channel {channel} | 通道 {channel} | 通道 {channel} |
| No complete channel in this view | 当前视图中未形成完整通道 | 目前檢視中未形成完整通道 |
| Both gates are active, so the full channel is connected in this view. | 两个闸门均已激活，因此当前视图中的整条通道已接通。 | 兩個閘門均已啟動，因此目前檢視中的整條通道已接通。 |
| A full channel needs both gates. At least one is inactive in this view. | 完整通道需要两端闸门都激活；当前视图中至少有一端未激活。 | 完整通道需要兩端閘門都啟動；目前檢視中至少有一端未啟動。 |
| Gate {gate} · {source} | 第 {gate} 闸门 · {source} | 第 {gate} 閘門 · {source} |
| View gate details | 查看闸门详情 | 查看閘門詳情 |
| Transit additions do not change your birth chart. | 行运带来的新增激活不会改变你的出生图。 | 流日帶來的新增啟動不會改變你的出生圖。 |
| Not activated in your natal chart. | 你的出生图中未激活此闸门。 | 你的出生圖中未啟動此閘門。 |
| Not activated by the selected transit. | 所选行运未激活此闸门。 | 所選流日未啟動此閘門。 |
|  (channel active in this view) | （当前视图中通道已接通） | （目前檢視中通道已接通） |
|  (no complete channel in this view) | （当前视图中未形成完整通道） | （目前檢視中未形成完整通道） |
| Defined in birth chart | 出生图中已有定义 | 出生圖中已有定義 |
| Defined by transits | 由行运定义 | 由流日定義 |
| Defined with transits | 叠加行运后形成定义 | 疊加流日後形成定義 |
| Not defined in this view | 当前视图中未定义 | 目前檢視中未定義 |
| Transit only · status from the selected time. | 仅行运 · 显示所选时刻的状态。 | 僅流日 · 顯示所選時刻的狀態。 |
| Birth chart + transits · hatching marks temporary additions. | 出生图＋行运 · 斜线标记临时新增的定义。 | 出生圖＋流日 · 斜線標記暫時新增的定義。 |
| This center is already defined in the birth chart. | 这个中心在出生图中已有定义。 | 這個中心在出生圖中已有定義。 |
| A complete channel defines this center in the selected view. This does not change your birth chart. | 当前视图中，一条完整通道使这个中心形成定义。这不会改变你的出生图。 | 目前檢視中，一條完整通道使這個中心形成定義。這不會改變你的出生圖。 |
| No complete channel defines this center in the selected view. | 当前视图中，没有完整通道使这个中心形成定义。 | 目前檢視中，沒有完整通道使這個中心形成定義。 |
| Transit only bodygraph. Transit activations are marked separately. Channels: {channels}. | 仅行运人体图。行运激活单独标示。通道：{channels}。 | 僅流日人體圖。流日啟動單獨標示。通道：{channels}。 |
| Birth chart plus transits bodygraph. Transit activations are marked separately. Channels: {channels}. | 出生图叠加行运的人体图。行运激活单独标示。通道：{channels}。 | 出生圖疊加流日的人體圖。流日啟動單獨標示。通道：{channels}。 |
| {label}, {source} | {label}，{source} | {label}，{source} |
| birth chart | 出生图 | 出生圖 |
| with transits | 叠加行运 | 疊加流日 |
| selected view | 当前视图 | 目前檢視 |
| Defined by the selected transit combination | 由所选行运组合形成定义 | 由所選流日組合形成定義 |
| Not defined in the selected view | 所选视图中未定义 | 所選檢視中未定義 |
| At the selected time, the strongest theme is the <strong>{channel}</strong> channel {connection} — {count} in total. | 在所选时刻，最明显的主题来自<strong>{channel}</strong>，{connection}；共{count}。 | 在所選時刻，最明顯的主題來自<strong>{channel}</strong>，{connection}；共{count}。 |
| At the selected time, it is a quiet sky for your chart — no transit completes one of your channels, so the weather passes through gently. | 所选时刻没有行运补全你的本命通道，整体影响相对轻缓。 | 所選時刻沒有流日補全你的本命通道，整體影響相對輕緩。 |
| Gate {gate} · Line {line} | 第 {gate} 闸门 · 第 {line} 爻 | 第 {gate} 閘門 · 第 {line} 爻 |
| Transit channels ({count}) | 行运通道（{count} 条） | 流日通道（{count} 條） |
| Both gates are activated by the selected transits. | 两端闸门均由所选行运激活。 | 兩端閘門均由所選流日啟動。 |
| Pure transit channel — both gates carried by the planets at the selected time. | 纯行运通道，两端闸门都由所选时刻的行星带入。 | 純流日通道，兩端閘門都由所選時刻的行星帶入。 |
| No complete channels at this time. | 此时没有完整通道。 | 此時沒有完整通道。 |
| Transit-defined centers ({count}) | 行运定义的中心（{count} 个） | 流日定義的中心（{count} 個） |
| Temporarily Defined Centers ({count}) | 暂时定义的能量中心（{count} 个） | 暫時定義的能量中心（{count} 個） |
| {theme} — defined by a complete channel in the selected transits. | {theme}：由所选行运中的完整通道形成定义。 | {theme}：由所選流日中的完整通道形成定義。 |
| {theme} — usually undefined in your chart, activated at the selected time by transit. | {theme}：这个中心在你的出生图中通常未定义，在所选时刻由行运激活。 | {theme}：這個中心在你的出生圖中通常未定義，在所選時刻由流日啟動。 |
