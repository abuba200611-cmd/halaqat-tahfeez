/*
  المكتبة المشتركة للرسوم البيانية — كل لوحة (معلّم/جامع/جمعية/مطوّر) تستورد
  رسومها من هنا، فلا تُكرَّر المكوّنات وتبقى الهوية البصرية واحدة.
*/
export {
  Chip,
  Dot,
  Panel,
  PanelEmpty,
  TONES,
  pillClass,
  softCardClass,
  type Tone,
} from "./panel";
export { BarChart, type Bar } from "./bar-chart";
export { Donut, type DonutSlice } from "./donut";
export { AreaChart, type DailyPoint } from "./area-chart";
export { HBarChart, type HBar } from "./hbar-chart";
