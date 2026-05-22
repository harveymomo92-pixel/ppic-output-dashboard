export type OutputRow = {
  Posting_Date: string;
  Document_Date: string;
  Entry_Type: string;
  Document_No: string;
  External_Document_No: string;
  Item_No: string;
  gProdOrRotLine_No: string;
  gItem_Description: string;
  Description: string;
  Location_Code: string;
  Quantity: string;
  Unit_of_Measure_Code: string;
  Item_Category_Code: string;
  Order_No: string;
  Entry_No: string;
  Bahan_Type: string;
  Gross_Weight: string;
  gProdOrRotLine_Description: string;
  Machine_Center_No: string;
  divcode: string;
  divname: string;
  [key: string]: string;
};

export type ChartPoint = { name: string; value: number; extra?: string };

export type MasterEntityTarget = {
  area_kerja_line: string;
  kode_asli_sistem: string;
  kode_asli_normalized: string;
  display_laporan: string;
  deskripsi_produk: string;
  target_botol_preform: string;
  target_thermoforming: string;
  target_thermoforming_gw_gt_12: string;
  target_printing_non_oz: string;
  target_printing_oz_lt_20: string;
  target_printing_22_oz: string;
  active_target_type: string;
  active_target: string;
  target_achievement_rate: string;
  target_reject_rate: string;
  [key: string]: string;
};
