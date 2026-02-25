# Nordic Seas Particle Visualization

Interactive Nordic Seas visualization with raster layers and animated particle flow (model, gridded products, and SWOT-based surface currents).

## Data Sources

### Model (MITgcm simulation)

5-day snapshots for 2010-2011 are included in this GitHub Pages demo. The full archive is not hosted here because of GitHub storage/quota limits.

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

- Jian, D., Zhai, X., Stevens, D. P., & Renfrew, I. A. (2026). *Oceanic heat transport along the Norwegian Atlantic Slope Current and the role of eddies*. *Journal of Geophysical Research: Oceans*, **131**(1), e2025JC022960. (MITgcm model simulation context)

## Related Webpage

- https://greenlandsea.github.io/
