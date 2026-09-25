/**
 * Simplified-Chinese display vocabulary for Human Design.
 *
 * Keep engine keys and calculation data in English.  This module only owns
 * presentation, so upstream NatalEngine updates cannot silently change the
 * meaning of stored charts or shared URLs.
 */

import hexagrams from './hexagrams.json' with { type: 'json' };

export const TYPE_ZH = {
  Generator: ['生产者', '等待回应', '挫败', '满足'],
  'Manifesting Generator': ['显示生产者', '等待回应，行动前告知', '挫败／愤怒', '满足'],
  Manifestor: ['显示者', '行动前告知', '愤怒', '平和'],
  Projector: ['投射者', '等待邀请', '苦涩', '成功'],
  Reflector: ['反映者', '等待一个月亮周期', '失望', '惊喜']
};

export const TYPE_PLAIN_ZH = {
  Generator: '你拥有可持续的生命力。回应已经出现的事物，而非追逐尚未到来的事物，生活会运作得更顺畅。',
  'Manifesting Generator': '你拥有强劲而快速的能量，能同时投入许多事情。先回应，再告知会受到你行动影响的人。',
  Manifestor: '你来到这里是为了发起行动。你不必等待任何人，但在行动前告知他人，能让前路更顺畅。',
  Projector: '你来到这里是为了引导他人、清晰地看见系统。你的天赋在获得认可和邀请时发挥作用，而非靠强行推进。',
  Reflector: '你映照着群体的健康状态。在作出重大决定前，给自己一个完整的月亮周期（约 28 天），并谨慎选择所处的环境。'
};

export const AUTHORITY_ZH = {
  "Emotional Authority": "情绪权威",
  "Sacral Authority": "骶骨权威",
  "Splenic Authority": "直觉权威",
  "Ego/Heart Authority": "意志力／心脏权威",
  "Self-Projected Authority": "自我投射权威",
  "Mental/Environment": "环境／声音板权威",
  "Lunar Authority": "月亮权威"
};

export const PROFILE_ZH = {
  "1/3": "研究者／实验者",
  "1/4": "研究者／机会主义者",
  "2/4": "隐士／机会主义者",
  "2/5": "隐士／异端者",
  "3/5": "实验者／异端者",
  "3/6": "实验者／榜样",
  "4/6": "机会主义者／榜样",
  "4/1": "机会主义者／研究者",
  "5/1": "异端者／研究者",
  "5/2": "异端者／隐士",
  "6/2": "榜样／隐士",
  "6/3": "榜样／实验者"
};

export const DEFINITION_ZH = {
  'Single Definition': '一分人定义',
  'Split Definition': '二分人定义',
  'Triple Split Definition': '三分人定义',
  'Quadruple Split Definition': '四分人定义',
  'No Definition': '无定义'
};

export const CENTER_ZH = {
  "head": {
    "name": "头顶中心"
  },
  "ajna": {
    "name": "逻辑中心（Ajna）"
  },
  "throat": {
    "name": "喉咙中心"
  },
  "g": {
    "name": "G 中心（自我中心）"
  },
  "heart": {
    "name": "意志力中心（心脏／自我）"
  },
  "sacral": {
    "name": "骶骨中心"
  },
  "spleen": {
    "name": "直觉中心（脾脏）"
  },
  "solar": {
    "name": "情绪中心（太阳神经丛）"
  },
  "root": {
    "name": "根部中心"
  }
};

// Classical hexagram names are separate from the upstream Human Design names.
export const HEXAGRAM_ZH = Object.fromEntries(Object.entries(hexagrams).map(([number, data]) => [number, data.name]));
// Translate the upstream HD gate name only; keep hexagram labels separate.
const GATE_NAMES = ['创造','接纳','秩序','形成答案','固定节奏','摩擦','自我角色','贡献','专注','自我行为','观念','谨慎','倾听者','力量技巧','极端','技能','意见','修正','需要','当下','猎人','开放','同化','合理化','纯真','巧术者','照顾','玩家','坚持','感受的辨认','领导','延续','隐私','力量','改变','危机','友谊','战士','挑衅','独处','收缩','成长','洞见','相遇','聚集','身体之爱','领悟','深度','原则','价值','震荡','静止','开始','野心','精神','刺激','直觉','活力','性','限制','神秘','细节','怀疑','困惑'];
export const GATE_ZH = Object.fromEntries(GATE_NAMES.map((v, i) => [i + 1, v]));

const CHANNEL_ROWS = {
  '1-8':'灵感通道','2-14':'脉动通道','3-60':'突变通道','4-63':'逻辑通道','5-15':'节奏通道','6-59':'亲密通道',
  '7-31':'领导通道','9-52':'专注通道','10-20':'觉醒通道','10-34':'探索通道','10-57':'完美形式通道','11-56':'好奇通道',
  '12-22':'开放通道','13-33':'浪子通道','16-48':'波长通道','17-62':'接受通道','18-58':'判断通道','19-49':'综合通道',
  '20-34':'魅力通道','20-57':'脑波通道','21-45':'金钱通道','23-43':'结构化通道','24-61':'觉知通道','25-51':'启动通道',
  '26-44':'臣服通道','27-50':'保存通道','28-38':'奋斗通道','29-46':'发现通道','30-41':'辨认通道','32-54':'转化通道',
  '34-57':'力量通道','35-36':'无常通道','37-40':'社群通道','39-55':'情绪化通道','42-53':'成熟通道','47-64':'抽象通道'
};
export const CHANNEL_ZH = CHANNEL_ROWS;

export const CIRCUIT_ZH = { individual: '个体回路', collective: '集体回路', tribal: '家族回路', integration: '整合回路', knowing: '知晓回路', logic: '逻辑回路', sensing: '感知回路', ego: '自我回路', defense: '防御回路', centering: '中心化回路' };

export const PLANET_ZH = { sun:'太阳', earth:'地球', moon:'月亮', northNode:'北交点', southNode:'南交点', mercury:'水星', venus:'金星', mars:'火星', jupiter:'木星', saturn:'土星', uranus:'天王星', neptune:'海王星', pluto:'冥王星' };
export const LINE_ZH = { 1:'研究者', 2:'隐士', 3:'实验者', 4:'机会主义者', 5:'异端者', 6:'榜样' };

export const VARIABLE_ZH = {
  "Appetite": "食欲型",
  "Taste": "口味型",
  "Thirst": "温度型",
  "Touch": "触觉型",
  "Sound": "声音型",
  "Light": "光线型",
  "Caves": "洞穴环境",
  "Markets": "市场环境",
  "Kitchens": "厨房环境",
  "Mountains": "高地环境",
  "Valleys": "山谷环境",
  "Shores": "岸边环境",
  "Survival": "生存视角",
  "Possibility": "可能性视角",
  "Power": "权力视角",
  "Wanting": "欲望视角",
  "Probability": "概率视角",
  "Personal": "个人视角",
  "Fear": "恐惧动机",
  "Hope": "希望动机",
  "Desire": "欲望动机",
  "Need": "需要动机",
  "Guilt": "责任动机",
  "Innocence": "纯真动机",
  "Smell": "嗅觉认知",
  "Outer Vision": "外在视觉",
  "Inner Vision": "内在视觉",
  "Feeling": "感觉认知"
};

export const zhType = name => TYPE_ZH[name]?.[0] || name || '—';
export const zhStrategy = name => TYPE_ZH[name]?.[1] || '—';
export const zhNotSelf = name => TYPE_ZH[name]?.[2] || '—';
export const zhSignature = name => TYPE_ZH[name]?.[3] || '—';
export const zhAuthority = name => AUTHORITY_ZH[name] || name || '—';
export const zhProfile = numbers => PROFILE_ZH[numbers] || '';
export const zhDefinition = value => DEFINITION_ZH[value] || value || '—';
const CENTER_KEY_BY_NAME = { Head:'head', Ajna:'ajna', Throat:'throat', G:'g', 'G Center':'g', Ego:'heart', 'Heart/Ego':'heart', Sacral:'sacral', Spleen:'spleen', 'Solar Plexus':'solar', Root:'root' };
export const zhCenter = key => CENTER_ZH[key]?.name || CENTER_ZH[CENTER_KEY_BY_NAME[key]]?.name || key || '—';
export const zhGate = n => GATE_ZH[n] || `第 ${n} 闸门`;
export const zhChannel = gates => CHANNEL_ZH[Array.isArray(gates) ? gates.join('-') : gates] || String(gates);
export const zhCircuit = value => {
  if (!value) return '—';
  const key = String(value).replace(/\s+Circuit$/i, '').toLowerCase();
  return CIRCUIT_ZH[key] || value;
};
export const zhPlanet = value => PLANET_ZH[value] || value;
export const zhLine = value => LINE_ZH[value] || value;
export const zhVariable = slot => [VARIABLE_ZH[slot?.name] || slot?.name || '—', slot?.description || ''];
// Taste and Touch have different labels in determination and cognition.
export const zhCognition = name => ({ Smell:'嗅觉', Taste:'味觉', 'Outer Vision':'外在视觉', 'Inner Vision':'内在视觉', Feeling:'感觉', Touch:'触觉' })[name] || name || '—';
