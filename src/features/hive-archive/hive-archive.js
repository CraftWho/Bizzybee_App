console.log("/// HIVE ARCHIVE PROTOCOLS INITIALIZED (WIP) ///");

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    Waggle.setActions(baseWaggleActions());
});
