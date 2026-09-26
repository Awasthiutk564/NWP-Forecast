import geopandas as gpd

gdf = gpd.read_parquet("data/LGD_Districts.parquet")

print("Rows:", len(gdf))
print("CRS:", gdf.crs)
print("\nColumns:", list(gdf.columns))
print("\nFirst 3 rows:")
print(gdf.drop(columns="geometry").head(3).to_string())

# Find which column holds state names, and how AP/Telangana are spelled
for col in gdf.columns:
    if col == "geometry":
        continue
    vals = gdf[col].astype(str)
    hits = vals[vals.str.contains("andhra|telangana", case=False)].unique()
    if len(hits) > 0:
        print(f"\nColumn '{col}' contains: {list(hits)[:10]}")