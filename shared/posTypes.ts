export const ADMIN_OPERATOR = "3509";
export const ID_MIN = 3501;
export const ID_MAX = 3540;

export const MEMBERS: Record<number, { name: string }> = {
  3501: { name: "青山 琉生" },
  3502: { name: "芦原 立樹" },
  3503: { name: "飯塚 陽彩" },
  3504: { name: "石原 菜々子" },
  3505: { name: "稲垣 大翔" },
  3506: { name: "内田 芽依" },
  3507: { name: "大友 莉音" },
  3508: { name: "大野 瑛司" },
  3509: { name: "岡田 好平" },
  3510: { name: "小川 皓也" },
  3511: { name: "小川 優衣奈" },
  3512: { name: "小高 大翔" },
  3513: { name: "門平 惣佑多" },
  3514: { name: "金本 大輝" },
  3515: { name: "河津 瑛士" },
  3516: { name: "木村 舞菜美" },
  3517: { name: "栗原 歩夢" },
  3518: { name: "楜澤 椋太" },
  3519: { name: "黒﨑 絆那" },
  3520: { name: "黒澤 健悟" },
  3521: { name: "児玉 裕斗" },
  3522: { name: "小林 由愛" },
  3523: { name: "齋藤 大和" },
  3524: { name: "澤田 凌" },
  3525: { name: "嶋﨑 隆司" },
  3526: { name: "高野 瞬世" },
  3527: { name: "高橋 麗名" },
  3528: { name: "寺尾 心花" },
  3529: { name: "戸澤 隼" },
  3530: { name: "中澤 輝" },
  3531: { name: "中島 龍臥" },
  3532: { name: "永田 豊" },
  3533: { name: "橋本 蒼生" },
  3534: { name: "林 浩希" },
  3535: { name: "藤森 美空" },
  3536: { name: "三好 優華" },
  3537: { name: "甕 百未" },
  3538: { name: "本吉 美優" },
  3539: { name: "柳田 有宇太" },
  3540: { name: "山口 創士" },
};

export type TransactionItem = {
  product_id: number;
  name: string;
  emoji: string;
  price: number;
  cost: number;
  qty: number;
};

export const NAV_ITEMS = [
  { key: "pos", label: "レジ", admin: false },
  { key: "dashboard", label: "売上", admin: false },
  { key: "inventory", label: "在庫", admin: false },
  { key: "products", label: "商品", admin: true },
  { key: "history", label: "履歴", admin: false },
  { key: "actlog", label: "操作", admin: true },
  { key: "pinmgr", label: "PIN", admin: true },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];

export const LOG_ACTIONS = [
  "login", "logout", "checkout", "void_tx", "delete_tx",
  "restock", "add_product", "edit_product", "delete_product", "reset_all",
  "reset_pin", "delete_pin",
] as const;

export type LogAction = (typeof LOG_ACTIONS)[number];

export const LOG_STYLE: Record<LogAction, { label: string; color: string; warn: boolean }> = {
  login: { label: "ログイン", color: "#15803d", warn: false },
  logout: { label: "ログアウト", color: "#64748b", warn: false },
  checkout: { label: "会計", color: "#1d4ed8", warn: false },
  void_tx: { label: "取引取消", color: "#b45309", warn: true },
  delete_tx: { label: "取引削除", color: "#dc2626", warn: true },
  restock: { label: "在庫補充", color: "#6366f1", warn: false },
  add_product: { label: "商品追加", color: "#ea580c", warn: false },
  edit_product: { label: "商品編集", color: "#ea580c", warn: false },
  delete_product: { label: "商品削除", color: "#dc2626", warn: true },
  reset_all: { label: "全リセット", color: "#dc2626", warn: true },
  reset_pin: { label: "PINリセット", color: "#7c3aed", warn: false },
  delete_pin: { label: "PIN削除", color: "#dc2626", warn: true },
};
