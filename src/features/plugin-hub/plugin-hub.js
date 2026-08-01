console.log("/// PLUGIN HUB PROTOCOLS INITIALIZED (WIP) ///");

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    HiveMind.setActions(baseHiveMindActions());
});
