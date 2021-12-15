'use strict';

const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('Replies with user information'),
    async execute(interaction) {
        await interaction.reply({
            content: `Your tag: ${interaction.user.toString()}\nYour id: ${interaction.user.id}`,
            ephemeral: true
        });
    }
}
