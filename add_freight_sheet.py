import pandas as pd
import numpy as np

def add_freight():
    tally_file = r"D:\AI\Upload\Tally Sale Data.xls"
    template_file = r"D:\AI\Upload\FG Templete.xlsx"
    fg_ready_file = r"D:\AI\Upload\FG_Templete_Ready.xlsx"
    output_file = r"D:\AI\Upload\FG_Templete_With_Freight.xlsx"

    print("Reading Tally Data...")
    try:
        tally_df = pd.read_excel(tally_file, header=None)
    except Exception as e:
        print(f"Error reading tally file: {e}")
        return

    print("Reading FG_Templete_Ready FinishGoods...")
    try:
        fg_df = pd.read_excel(fg_ready_file, sheet_name="FinishGoods")
    except Exception as e:
        print(f"Error reading FG Ready: {e}")
        return

    print("Reading FG Template FreightCharges to get headers...")
    try:
        freight_template_df = pd.read_excel(template_file, sheet_name="FreightCharges")
    except Exception as e:
        print(f"Error reading Freight template: {e}")
        return

    new_freight_rows = []
    seen_invoices = set()

    for i in range(7, len(tally_df)):
        row = tally_df.iloc[i]
        
        col_A_date = row[0]
        col_B_part = row[1]
        col_E_disp = row[4]  # Invoice No
        col_G_dest = row[6]  # Place
        col_I_veh = row[8]   # Vehicle No

        if pd.isna(col_B_part) or col_B_part == 'Particulars':
            continue
        
        if pd.notna(col_A_date) and str(col_A_date).strip() != "" and str(col_A_date).strip() != "Date":
            # This is a customer row (header for invoice)
            try:
                date_str = pd.to_datetime(col_A_date).strftime('%d-%m-%Y')
            except Exception:
                date_str = str(col_A_date)
            
            invoice_no = str(col_E_disp).strip() if pd.notna(col_E_disp) else ""
            
            if invoice_no and invoice_no not in seen_invoices:
                seen_invoices.add(invoice_no)
                
                customer_name = str(col_B_part).strip()
                place = str(col_G_dest).strip() if pd.notna(col_G_dest) else ""
                vehicle_no = str(col_I_veh).strip() if pd.notna(col_I_veh) else ""
                
                new_row = {
                    freight_template_df.columns[0]: date_str,
                    freight_template_df.columns[1]: invoice_no,
                    freight_template_df.columns[2]: customer_name,
                    freight_template_df.columns[3]: place,
                    freight_template_df.columns[4]: '', # Transporter
                    freight_template_df.columns[5]: vehicle_no,
                    freight_template_df.columns[6]: '', # Vehicle Size
                    freight_template_df.columns[7]: '', # Freight
                    freight_template_df.columns[8]: '', # Holding
                    freight_template_df.columns[9]: '', # Point
                    freight_template_df.columns[10] if len(freight_template_df.columns) > 10 else 'Others ()': ''
                }
                new_freight_rows.append(new_row)

    out_freight_df = pd.DataFrame(new_freight_rows)
    
    # We want the output excel to have both 'FinishGoods' and 'FreightCharges'
    print(f"Writing to {output_file}...")
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        fg_df.to_excel(writer, sheet_name='FinishGoods', index=False)
        out_freight_df.to_excel(writer, sheet_name='FreightCharges', index=False)

    print(f"Successfully processed {len(new_freight_rows)} freight invoices.")

if __name__ == "__main__":
    add_freight()
