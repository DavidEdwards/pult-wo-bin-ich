h1. Pult WoBinIch

This project is a bit of fun to remind you which room you are signed up in for the office. 

You need to get an AUTH_TOKEN from the Pult API and set it in a local .env file. 

Changes to room structure can be applied in the room-definition.md file.

The result of this can be delivered directly to a slack channel as a notification.

Place images in the images folder to send them to slack. They should be named like the room name with - instead of spaces.

h1. Steps

1. Create a .env file and add your `AUTH_TOKEN=...`.
2. `node index.js`
