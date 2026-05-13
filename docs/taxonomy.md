# uVidNova Asset Type Taxonomy

Human-readable reference for `data/taxonomy.json`. The taxonomy is frozen at v1 — adding a new type requires a separate PR including a unit_cost row and any new physical_spec fields.

## Sectors and asset types

### energy_and_power
| Type | Label | Primary unit |
|---|---|---|
| `energy.hpp` | Hydroelectric Power Plant | MW |
| `energy.tpp` | Thermal Power Plant | MW |
| `energy.npp` | Nuclear Power Plant | MW |
| `energy.substation` | Electrical Substation | MVA |
| `energy.wind_farm` | Wind Farm | MW |
| `energy.solar_farm` | Solar Farm | MW |
| `energy.gas_storage` | Gas Storage Facility | bcm |

### healthcare
| Type | Label | Primary unit |
|---|---|---|
| `healthcare.tertiary_hospital` | Tertiary / Specialist Hospital | beds |
| `healthcare.regional_hospital` | Regional General Hospital | beds |
| `healthcare.district_hospital` | District Hospital | beds |
| `healthcare.maternity_hospital` | Maternity Hospital | beds |
| `healthcare.polyclinic` | Polyclinic / Outpatient Centre | m² |

### education
| Type | Label | Primary unit |
|---|---|---|
| `education.university` | University / Higher Education | m² |
| `education.secondary_school` | Secondary School | m² |
| `education.vocational_school` | Vocational / Technical School | m² |
| `education.kindergarten` | Kindergarten / Pre-school | m² |

### residential
| Type | Label | Primary unit |
|---|---|---|
| `residential.apartment_block_district` | Apartment Block District | m² |
| `residential.apartment_block_single` | Single Apartment Block | m² |
| `residential.private_housing_district` | Private Housing District | units |

### heritage_and_culture
All heritage types carry a conservation premium multiplier (1.8×–3.0×).

| Type | Label | Primary unit |
|---|---|---|
| `heritage.theatre` | Theatre / Opera House | m² |
| `heritage.museum` | Museum | m² |
| `heritage.religious` | Religious Monument | m² |
| `heritage.library` | Heritage Library / Archive | m² |
| `heritage.memorial` | Memorial / Monument | m² |

### transport_and_ports
| Type | Label | Primary unit |
|---|---|---|
| `transport.airport` | Airport | m² |
| `transport.aircraft` | Strategic Aircraft | units |
| `transport.bridge` | Road / Rail Bridge | m² |
| `transport.seaport` | Seaport / River Port | m² |
| `transport.rail_segment` | Railway Segment / Station | km |
| `transport.shipyard` | Shipyard | m² |

### water_and_sanitation
| Type | Label | Primary unit |
|---|---|---|
| `water.supply` | Water Supply System | m³/day |
| `water.treatment` | Wastewater Treatment Plant | m³/day |
| `water.canal` | Irrigation Canal / Water Infrastructure | km |
| `water.district_heating` | District Heating Network | km |

### industrial_and_agricultural
| Type | Label | Primary unit |
|---|---|---|
| `industrial.steelworks` | Integrated Steelworks | tonnes/year |
| `industrial.coke` | Coke Plant | tonnes/year |
| `industrial.chemical` | Chemical / Fertiliser Plant | tonnes/year |
| `industrial.machinery` | Machinery / Defence Industrial | m² |
| `agricultural.grain_terminal` | Grain Terminal / Silo Complex | tonnes |
| `agricultural.processing` | Agricultural Processing Facility | m² |

### public_administration
| Type | Label | Primary unit |
|---|---|---|
| `public_admin.regional` | Regional / Oblast Administration | m² |
| `public_admin.library` | Public Library | m² |
| `public_admin.court` | Court / Justice Facility | m² |
| `public_admin.emergency_services` | Emergency Services Facility | m² |
