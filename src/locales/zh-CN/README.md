# 简体中文词典维护

源文本：`natalengine@1.6.0`。全部译文在本地随应用加载，不调用在线翻译服务。每个字段只有一个正式维护位置，不再叠加分组审校稿。

| 文件 | 唯一维护的内容 |
|---|---|
| `gates.json` | 64 闸门的主题句、说明、象限和谐波编号 |
| `lines.json` | 64 闸门 × 6 条人类图爻线，按闸门和爻编号定位 |
| `channels.json` | 36 条通道的说明、定义表现和能量类型 |
| `hexagrams.json` | 64 卦名、总义和 384 条易经爻辞；浮窗卦名也读取这里 |
| `gene-keys.json` | 64 组基因钥匙频谱词与说明，按编号区分同词异义 |
| `vocabulary.js` | 类型、权威、中心、人生角色、HD 闸门名、通道名和四箭头等术语 |
| `engine-messages.json` | 引擎返回的其余说明和词条，以完整英文源字符串为键 |
| `engine-templates.json` | 引擎动态句型与译文；仅两处英文复数后缀显式省略 |
| `ui-common.json` | 多个界面共用的文案；其他 UI 词典不重复声明 |
| `ui-static.json`、`ui-main.json`、`ui-chart.json`、`ui-views.json`、`ui-bodygraph.json` | 分别对应静态页面、入口、个人图、其他视图和人体图文案 |
| `index.js` | 本语言资源入口、标点、日期、列表和浮窗等显示规则 |
| `content.js` | 由以上正式词典生成引擎文本查找，不维护第二份正文 |

易经卦名、HD 闸门名、基因钥匙关键词分开维护，不能因为英文相同就全局替换。正文和术语支持按编号查找；动态引擎句子仍需要匹配上游英文文本，升级 NatalEngine 时要核对变化并补充测试。

新增共用 UI 文案时放入 `ui-common.json`，不要在多个文件复制。特殊语境的键与英文回退位于 `../ui-contexts.json`。新增语言按 [Localization](../../../docs/localization.md) 的资源接口接入，不在页面添加中文判断。

核验命令：`node --test tests/i18n.test.js tests/localization.test.js`。测试检查唯一键、占位符、完整覆盖、原始英文一致性和计算对象不变性；语义与通用译法仍需人工对照 [术语表](../../../docs/术语对照表.zh-CN.md)。
