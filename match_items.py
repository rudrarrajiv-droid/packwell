import pandas as pd
import difflib

def match_items():
    master_file = r"D:\AI\Upload\Master Data.xlsx"
    fg_file = r"D:\AI\Upload\FG_Templete_Ready.xlsx"
    
    try:
        # Assuming Master Data has headers, and item name is in column B (index 1)
        master_df = pd.read_excel(master_file)
        # Handle if there's no header and B is just column index 1
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
    
    exact_matches = {}
    fuzzy_matches = {}
    ambiguous = {}

    for fg_item in fg_items_str:
        if fg_item in master_items_str:
            exact_matches[fg_item] = fg_item
        else:
            # Case insensitive exact match try
            lower_master = {m.lower(): m for m in master_items_str}
            if fg_item.lower() in lower_master:
                fuzzy_matches[fg_item] = lower_master[fg_item.lower()]
                continue
            
            # Fuzzy matching
            matches = difflib.get_close_matches(fg_item, master_items_str, n=3, cutoff=0.6)
            if len(matches) == 1 or (len(matches) > 1 and difflib.SequenceMatcher(None, fg_item, matches[0]).ratio() > 0.85):
                # Strong match or only one reasonable match
                fuzzy_matches[fg_item] = matches[0]
            elif len(matches) > 1:
                ambiguous[fg_item] = matches
            else:
                ambiguous[fg_item] = []
                
    print("=== EXACT MATCHES ===")
    print(f"Count: {len(exact_matches)}")
    
    print("\n=== FUZZY MATCHES (High Confidence) ===")
    for k, v in fuzzy_matches.items():
        print(f"'{k}'  ->  '{v}'")
        
    print("\n=== AMBIGUOUS / NO MATCH ===")
    for k, v in ambiguous.items():
        print(f"'{k}'  ->  Options: {v}")

if __name__ == "__main__":
    match_items()
