/**
 * Traditional-Chinese display vocabulary for Human Design.
 *
 * Keep engine keys and calculation data in English.  This module only owns
 * presentation, so upstream NatalEngine updates cannot silently change the
 * meaning of stored charts or shared URLs.
 */

import hexagrams from './hexagrams.json' with { type: 'json' };

export const TYPE_ZH = {
  Generator: ['生產者', '等待回應', '挫敗', '滿足'],
  'Manifesting Generator': ['顯示生產者', '等待回應，行動前告知', '挫敗／憤怒', '滿足'],
  Manifestor: ['顯示者', '行動前告知', '憤怒', '平和'],
  Projector: ['投射者', '等待邀請', '苦澀', '成功'],
  Reflector: ['反映者', '等待一個月亮週期', '失望', '驚喜']
};

export const TYPE_PLAIN_ZH = {
  Generator: '你擁有可持續的生命力。回應已經出現的事物，而非追逐尚未到來的事物，生活會運作得更順暢。',
  'Manifesting Generator': '你擁有強勁而快速的能量，能同時投入許多事情。先回應，再告知會受到你行動影響的人。',
  Manifestor: '你來到這裡是為了發起行動。你不必等待任何人，但在行動前告知他人，能讓前路更順暢。',
  Projector: '你來到這裡是為了引導他人、清晰地看見系統。你的天賦在獲得認可和邀請時發揮作用，而非靠強行推進。',
  Reflector: '你映照著群體的健康狀態。在作出重大決定前，給自己一個完整的月亮週期（約 28 天），並謹慎選擇所處的環境。'
};

export const AUTHORITY_ZH = {
  "Emotional Authority": "情緒權威",
  "Sacral Authority": "薦骨權威",
  "Splenic Authority": "直覺權威",
  "Ego/Heart Authority": "意志力／心臟權威",
  "Self-Projected Authority": "自我投射權威",
  "Mental/Environment": "環境／聲音板權威",
  "Lunar Authority": "月亮權威"
};

export const PROFILE_ZH = {
  "1/3": "探究者／烈士",
  "1/4": "探究者／機會主義者",
  "2/4": "隱士／機會主義者",
  "2/5": "隱士／異端者",
  "3/5": "烈士／異端者",
  "3/6": "烈士／人生典範",
  "4/6": "機會主義者／人生典範",
  "4/1": "機會主義者／探究者",
  "5/1": "異端者／探究者",
  "5/2": "異端者／隱士",
  "6/2": "人生典範／隱士",
  "6/3": "人生典範／烈士"
};

export const DEFINITION_ZH = {
  'Single Definition': '一分人',
  'Split Definition': '二分人',
  'Triple Split Definition': '三分人',
  'Quadruple Split Definition': '四分人',
  'No Definition': '無定義'
};

export const CENTER_ZH = {
  "head": {
    "name": "頭頂中心"
  },
  "ajna": {
    "name": "邏輯中心（Ajna）"
  },
  "throat": {
    "name": "喉嚨中心"
  },
  "g": {
    "name": "G 中心（自我中心）"
  },
  "heart": {
    "name": "意志力中心（心臟／自我）"
  },
  "sacral": {
    "name": "薦骨中心"
  },
  "spleen": {
    "name": "直覺中心（脾臟）"
  },
  "solar": {
    "name": "情緒中心（太陽神經叢）"
  },
  "root": {
    "name": "根部中心"
  }
};

// Classical hexagram names are separate from the upstream Human Design names.
export const HEXAGRAM_ZH = Object.fromEntries(Object.entries(hexagrams).map(([number, data]) => [number, data.name]));
// Translate the upstream HD gate name only; keep hexagram labels separate.
const GATE_NAMES = ['創造','接納','秩序','形成答案','固定節奏','摩擦','自我角色','貢獻','專注','自我行為','觀念','謹慎','傾聽者','力量技巧','極端','技能','意見','修正','需要','當下','獵人','開放','同化','合理化','純真','巧術者','照顧','玩家','堅持','感受的辨認','領導','延續','隱私','力量','改變','危機','友誼','戰士','挑釁','獨處','收縮','成長','洞見','相遇','聚集','身體之愛','領悟','深度','原則','價值','震盪','靜止','開始','野心','精神','刺激','直覺','活力','性','限制','神秘','細節','懷疑','困惑'];
export const GATE_ZH = Object.fromEntries(GATE_NAMES.map((v, i) => [i + 1, v]));

const CHANNEL_ROWS = {
  '1-8':'靈感通道','2-14':'脈動通道','3-60':'突變通道','4-63':'邏輯通道','5-15':'節奏通道','6-59':'親密通道',
  '7-31':'領導通道','9-52':'專注通道','10-20':'覺醒通道','10-34':'探索通道','10-57':'完美形式通道','11-56':'好奇通道',
  '12-22':'開放通道','13-33':'浪子通道','16-48':'波長通道','17-62':'接受通道','18-58':'判斷通道','19-49':'綜合通道',
  '20-34':'魅力通道','20-57':'腦波通道','21-45':'金錢通道','23-43':'結構化通道','24-61':'覺知通道','25-51':'啟動通道',
  '26-44':'臣服通道','27-50':'保存通道','28-38':'奮鬥通道','29-46':'發現通道','30-41':'辨認通道','32-54':'轉化通道',
  '34-57':'力量通道','35-36':'無常通道','37-40':'社群通道','39-55':'情緒化通道','42-53':'成熟通道','47-64':'抽象通道'
};
export const CHANNEL_ZH = CHANNEL_ROWS;

export const CIRCUIT_ZH = { individual: '個體人迴路', collective: '社會人迴路', tribal: '家族人迴路', integration: '整合迴路', knowing: '知曉迴路', logic: '邏輯迴路', sensing: '感知迴路', ego: '自我迴路', defense: '防禦迴路', centering: '中心化迴路' };

export const PLANET_ZH = { sun:'太陽', earth:'地球', moon:'月亮', northNode:'北交點', southNode:'南交點', mercury:'水星', venus:'金星', mars:'火星', jupiter:'木星', saturn:'土星', uranus:'天王星', neptune:'海王星', pluto:'冥王星' };
export const LINE_ZH = { 1:'探究者', 2:'隱士', 3:'烈士', 4:'機會主義者', 5:'異端者', 6:'人生典範' };

export const VARIABLE_ZH = {
  "Appetite": "食慾型",
  "Taste": "口味型",
  "Thirst": "溫度型",
  "Touch": "觸覺型",
  "Sound": "聲音型",
  "Light": "光線型",
  "Caves": "洞穴環境",
  "Markets": "市場環境",
  "Kitchens": "廚房環境",
  "Mountains": "高地環境",
  "Valleys": "山谷環境",
  "Shores": "岸邊環境",
  "Survival": "生存視角",
  "Possibility": "可能性視角",
  "Power": "權力視角",
  "Wanting": "慾望視角",
  "Probability": "機率視角",
  "Personal": "個人視角",
  "Fear": "恐懼動機",
  "Hope": "希望動機",
  "Desire": "慾望動機",
  "Need": "需要動機",
  "Guilt": "責任動機",
  "Innocence": "純真動機",
  "Smell": "嗅覺認知",
  "Outer Vision": "外在視覺",
  "Inner Vision": "內在視覺",
  "Feeling": "感覺認知"
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
export const zhGate = n => GATE_ZH[n] || `第 ${n} 閘門`;
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
export const zhCognition = name => ({ Smell:'嗅覺', Taste:'味覺', 'Outer Vision':'外在視覺', 'Inner Vision':'內在視覺', Feeling:'感覺', Touch:'觸覺' })[name] || name || '—';
