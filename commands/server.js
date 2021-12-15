'use strict';

const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('server')
        .setDescription('Replies with server information'),
    async execute(interaction) {
        await interaction.reply(`Server name: ${interaction.guild.name}\n` +
            `Server id: ${interaction.guild.id}\n` +
            `Total members: ${interaction.guild.memberCount}`);
    }
}
