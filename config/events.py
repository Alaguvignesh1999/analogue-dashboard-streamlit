from __future__ import annotations

from engine.models import EventDef, MacroContext


EVENTS = [
    EventDef("1973 Oil Embargo", "1973-10-17"),
    EventDef("1990 Gulf War", "1990-08-02"),
    EventDef("1991 Kuwait Oil Fires", "1991-01-16"),
    EventDef("1998 Desert Fox", "1998-12-16"),
    EventDef("2001 Afghanistan (OEF)", "2001-10-07"),
    EventDef("2003 SARS", "2003-03-12"),
    EventDef("2003 Iraq War", "2003-03-20"),
    EventDef("2011 Libya", "2011-03-19"),
    EventDef("2014 ISIS/Mosul", "2014-06-10"),
    EventDef("2017 Syria Strikes", "2017-04-07"),
    EventDef("COVID-19", "2020-03-01"),
    EventDef("2022 Russia-Ukraine", "2022-02-24"),
    EventDef("2023 Red Sea Crisis", "2023-12-19"),
]

ALL_TAGS = [
    "energy_shock",
    "military_conflict",
    "shipping_disruption",
    "sanctions",
    "pandemic",
]

EVENT_TAGS = {
    "1973 Oil Embargo": {"energy_shock", "sanctions"},
    "1990 Gulf War": {"military_conflict", "energy_shock"},
    "1991 Kuwait Oil Fires": {"military_conflict", "energy_shock"},
    "1998 Desert Fox": {"military_conflict"},
    "2001 Afghanistan (OEF)": {"military_conflict"},
    "2003 SARS": {"pandemic"},
    "2003 Iraq War": {"military_conflict", "energy_shock"},
    "2011 Libya": {"military_conflict", "energy_shock"},
    "2014 ISIS/Mosul": {"military_conflict", "energy_shock"},
    "2017 Syria Strikes": {"military_conflict"},
    "COVID-19": {"pandemic"},
    "2022 Russia-Ukraine": {"military_conflict", "energy_shock", "sanctions"},
    "2023 Red Sea Crisis": {"shipping_disruption", "military_conflict"},
}

MACRO_CONTEXT = {
    "1973 Oil Embargo": MacroContext(4, "high", "hiking"),
    "1990 Gulf War": MacroContext(17, "high", "cutting"),
    "1991 Kuwait Oil Fires": MacroContext(25, "high", "cutting"),
    "1998 Desert Fox": MacroContext(11, "low", "hold"),
    "2001 Afghanistan (OEF)": MacroContext(22, "low", "cutting"),
    "2003 SARS": MacroContext(35, "low", "cutting"),
    "2003 Iraq War": MacroContext(37, "low", "cutting"),
    "2011 Libya": MacroContext(85, "mid", "hold"),
    "2014 ISIS/Mosul": MacroContext(104, "low", "hold"),
    "2017 Syria Strikes": MacroContext(53, "mid", "hiking"),
    "COVID-19": MacroContext(54, "low", "cutting"),
    "2022 Russia-Ukraine": MacroContext(91, "high", "hiking"),
    "2023 Red Sea Crisis": MacroContext(73, "mid", "hold"),
}
