FROM node:14.16.0-alpine

RUN mkdir /app
WORKDIR /app

COPY LICENSE .
COPY README.md .
COPY build.txt .
COPY ./*.js ./
COPY ./*.json ./
COPY usecases ./usecases
COPY library ./library
COPY views ./views
COPY public ./public
RUN mkdir ./serviceData 
RUN echo "{}" > ./serviceData/services.json
COPY keys ./keys

RUN npm install

RUN chmod a+w ./serviceData
RUN chmod a+w ./usecases
RUN chmod a+w ./keys

EXPOSE 3012

CMD ["node", "app.js"]
