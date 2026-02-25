# Nordic Seas Particle Visualization

Interactive Nordic Seas visualization with raster layers and animated particle flow (model, gridded products, and SWOT-based surface currents).

## Data Sources

### Model (MITgcm simulation)

5-day snapshots for 2010-2011 are included in this GitHub Pages demo. The full archive is not hosted here because of GitHub storage/quota limits (and couldn't afford to cloud service...).

- MITgcm-based high-resolution ocean-ice coupled simulation (Nordic Seas).
- Topography / bathymetry: RTopo-2.0.4 (Schaffer et al., 2019)
- Surface Currents: Surface circulation
- Deep Currents: Horizontal circulation at 1200 m depth
- Vorticity: Surface relative vorticity
- SST: Sea Surface Temperature
- SSS: Sea Surface Salinity
- Ice: Ice concentration (0-1)
- Wind Stress: Normalized wind stress on ocean surface [N/m^2]

### Gridded Products

- Surface currents: geostrophic surface currents from SSALTO/DUACS altimetry products
- SST and sea ice: OSTIA
- Sea surface salinity (SSS): Global Ocean Sea Surface Salinity (Droghei et al., 2018)
- 10 m wind speed: ERA5 reanalysis [m/s]
- Topography / bathymetry: RTopo-2.0.4 (Schaffer et al., 2019)

### SWOT

- SWOT altimeter-derived surface geostrophic currents.
- Note: swaths from each ~21-day cycle are overlaid to improve spatial coverage, so each frame is not an instantaneous snapshot.

## References
D. Jian, X. Zhai, D. P. Stevens, I. Renfrew (2026).  
**Oceanic Heat Transport Along the Norwegian Atlantic Slope Current and the Role of Eddies.**  
*Journal of Geophysical Research: Oceans*.  
[https://doi.org/10.1029/2025JC022960](https://doi.org/10.1029/2025JC022960)

## Related Webpage

- A Greenland Sea demo in 3D: https://greenlandsea.github.io/
- Personal webpage: https://bve23zsu.github.io/
