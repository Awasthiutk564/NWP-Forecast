import geopandas as gpd

# 1. Read the LGD district file (Local Government Directory, Govt of India)
gdf = gpd.read_parquet("data/LGD_Districts.parquet")

# 2. Keep only Andhra Pradesh and Telangana
gdf = gdf[gdf["stname"].isin(["ANDHRA PRADESH", "TELANGANA"])].copy()

# 3. Make clean "district" and "state" columns
#    (names are already nicely cased; this just removes extra spaces)
gdf["district"] = gdf["dtname"].str.split().str.join(" ")
gdf["state"] = gdf["stname"].str.title()

# 4. Keep only the columns we need
gdf = gdf[["district", "state", "geometry"]]

# 5. Simplify outlines slightly so the dashboard loads fast (~200 m)
gdf["geometry"] = gdf.geometry.simplify(0.002, preserve_topology=True)

# 6. Save (this overwrites the old 13-district version)
gdf = gdf.to_crs("EPSG:4326")
gdf.to_file("data/districts_ap_ts.geojson", driver="GeoJSON")

# 7. Check the result
print("Districts per state:")
print(gdf["state"].value_counts())
print("\nBounds (lon_min, lat_min, lon_max, lat_max):", gdf.total_bounds.round(2))
for s in ["Andhra Pradesh", "Telangana"]:
    names = sorted(gdf.loc[gdf["state"] == s, "district"])
    print(f"\n{s} ({len(names)}):", ", ".join(names))