'use strict';

const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Replies with reddit request statistics'),
    async execute(interaction) {
        await interaction.reply(`This feature is not yet implemented`);
    }
}
