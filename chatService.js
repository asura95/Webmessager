const Chat = require("./modelsChats");

async function getOrCreateChat(userA_ID, userB_ID) {
  const participants = [userA_ID, userB_ID].sort();

  let chat = await Chat.findOne({
    type: "private",
    members: { $all: participants, $size: 2 },
  });

  if (!chat) {
    chat = new Chat({
      type: "private",
      members: participants,
    });
    await chat.save();
  }
  return chat;
}

module.exports = { getOrCreateChat };
