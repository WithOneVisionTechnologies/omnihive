FROM node:lts-alpine
RUN npm install -g yarn
COPY ../dist/omnihive /home/node/app/
RUN chown -R node:node /home/node/app
WORKDIR /home/node/app
USER node
RUN yarn install --silent
ENTRYPOINT ["node", "omnihive.js"]
CMD [ "server" ]