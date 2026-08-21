import pandas as pd
import numpy as np

def process_data():
    tally_file = r"D:\AI\Upload\Tally Sale Data.xls"
    template_file = r"D:\AI\Upload\FG Templete.xlsx"
    output_file = r"D:\AI\Upload\FG_Templete_Ready.xlsx"

    # Read Tally data
    try:
        tally_df = pd.read_excel(tally_file, header=None)
    except Exception as e:
        print(f"Error reading tally file: {e}")
        return

    # Read Template
    try:
        template_df = pd.read_excel(template_file, sheet_name="FinishGoods")
    except Exception as e:
        print(f"Error reading template file: {e}")
        return
    
    # We will build a list of dictionaries for the new rows
    new_rows = []

    current_date = None
    current_dispatch_no = None

    # Tally data starts from row 7 (index 7). Row 6 has headers.
    for i in range(7, len(tally_df)):
        row = tally_df.iloc[i]
        
        col_A_date = row[0]
        col_B_part = row[1]
        col_E_disp = row[4]
        col_M_qty = row[12]

        if pd.isna(col_B_part) or col_B_part == 'Particulars':
            continue
        
        if pd.notna(col_A_date) and str(col_A_date).strip() != "" and str(col_A_date).strip() != "Date":
            # Customer row
            try:
                current_date = pd.to_datetime(col_A_date).strftime('%d-%m-%Y')
            except Exception:
                current_date = str(col_A_date)
            current_dispatch_no = col_E_disp if pd.notna(col_E_disp) else ""
        else:
            # Item row
            if pd.notna(col_M_qty) and str(col_M_qty).strip() != "":
                item_name = str(col_B_part).strip()
                qty = col_M_qty
                
                # Append to new rows
                new_row = {
                    'Date': current_date,
                    'Type': 'OUT',
                    'Artwork No': item_name,
                    'Category': 'regular',
                    'Opening Bal': '',
                    'Rate': '',
                    'Quantity': qty,
                    template_df.columns[7] if len(template_df.columns) > 7 else 'Dispatch No': current_dispatch_no
                }
                new_rows.append(new_row)

    # Convert to dataframe
    out_df = pd.DataFrame(new_rows)
    
    # Write to excel, preserving sheet name
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        out_df.to_excel(writer, sheet_name='FinishGoods', index=False)

    print(f"Successfully processed {len(new_rows)} items. Saved to {output_file}")

if __name__ == "__main__":
    process_data()
