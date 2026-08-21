import pandas as pd
import difflib

def generate_mapping_excel():
    master_file = r"D:\AI\Upload\Master Data.xlsx"
    fg_file = r"D:\AI\Upload\FG_Templete_Ready.xlsx"
    output_excel = r"D:\AI\Upload\Item_Mapping_Review.xlsx"
    
    try:
        master_df = pd.read_excel(master_file)
        if 'Item Name' in master_df.columns:
            master_items = master_df['Item Name'].dropna().unique().tolist()
        else:
            master_items = master_df.iloc[:, 1].dropna().unique().tolist()
    except Exception as e:
        print(f"Error reading master: {e}")
        return

    try:
        fg_df = pd.read_excel(fg_file, sheet_name="FinishGoods")
        fg_items = fg_df['Artwork No'].dropna().unique().tolist()
    except Exception as e:
        print(f"Error reading FG: {e}")
        return

    master_items_str = [str(item).strip() for item in master_items]
    fg_items_str = [str(item).strip() for item in fg_items]
    
    data = []

    for fg_item in fg_items_str:
        if fg_item in master_items_str:
            # Skip exact matches
            continue
        else:
            # Case insensitive exact match try
            lower_master = {m.lower(): m for m in master_items_str}
            if fg_item.lower() in lower_master:
                data.append({
                    'Tally Item Name': fg_item,
                    'Suggested Master Data Name': lower_master[fg_item.lower()],
                    'Status': 'Suggested',
                    'Correct Master Data Name (Fill Here)': ''
                })
                continue
            
            # Fuzzy matching
            matches = difflib.get_close_matches(fg_item, master_items_str, n=3, cutoff=0.6)
            if len(matches) == 1 or (len(matches) > 1 and difflib.SequenceMatcher(None, fg_item, matches[0]).ratio() > 0.85):
                data.append({
                    'Tally Item Name': fg_item,
                    'Suggested Master Data Name': matches[0],
                    'Status': 'Suggested',
                    'Correct Master Data Name (Fill Here)': ''
                })
            else:
                data.append({
                    'Tally Item Name': fg_item,
                    'Suggested Master Data Name': '',
                    'Status': 'Not Found',
                    'Correct Master Data Name (Fill Here)': ''
                })
                
    df = pd.DataFrame(data)
    df.to_excel(output_excel, index=False)
    print(f"Successfully created review file: {output_excel}")

if __name__ == "__main__":
    generate_mapping_excel()
