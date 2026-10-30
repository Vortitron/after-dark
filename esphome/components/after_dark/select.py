"""A select listing the savers built for this screen, plus "off".

    select:
      - platform: after_dark
        name: Screensaver
"""
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import select
from esphome.core import CORE

from . import CONF_AFTER_DARK_ID, AfterDarkComponent, after_dark_ns, available_savers

DEPENDENCIES = ["after_dark"]

AfterDarkSelect = after_dark_ns.class_("AfterDarkSelect", select.Select, cg.Component)

CONFIG_SCHEMA = (
    select.select_schema(AfterDarkSelect, icon="mdi:monitor-star")
    .extend({cv.GenerateID(CONF_AFTER_DARK_ID): cv.use_id(AfterDarkComponent)})
    .extend(cv.COMPONENT_SCHEMA)
)


async def to_code(config):
    parent = await cg.get_variable(config[CONF_AFTER_DARK_ID])
    options = available_savers(CORE.config["after_dark"]) + ["off"]
    var = await select.new_select(config, options=options)
    await cg.register_component(var, config)
    cg.add(var.set_parent(parent))
