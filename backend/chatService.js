const Chat = require("./modelsChats");

async function getOrCreateChat(userA_ID, userB_ID, groupName = null) {
    if (groupName) {
        let chat = await Chat.findOne({ type: "group", groupName: groupName });
        if (!chat) {
            chat = new Chat({ type: "group", groupName: groupName, members: [] });
            await chat.save();
        }
        return chat;
    }
    // Private Chat
    const participants = [userA_ID, userB_ID].sort();
    let chat = await Chat.findOne({
        type: "private",
        members: { $all: participants, $size: 2 }
    });
    if (!chat) {
        chat = new Chat({ type: "private", members: participants });
        await chat.save();
    }
    return chat;
}

module.exports = { getOrCreateChat };