# Размещение на VPS (VDSina и другие)

`setup.sh` ставит nginx и выкладывает калькулятор. Подходит для Ubuntu 20.04+ и Debian 11+ без панели управления.
Если на сервере FASTPANEL, ISPmanager или Hestia, скрипт остановится: тогда создайте сайт в панели
и загрузите четыре файла (`index.html`, `style.css`, `calc.js`, `app.js`) через её файловый менеджер.

```bash
# архив с калькулятором и скриптом уже загружен на сервер в /root
cd /root && unzip -o pension-mvd-site.zip -d pension-mvd-site && cd pension-mvd-site

bash setup.sh                           # http://IP-сервера/pension-mvd/
bash setup.sh pensiya.ru you@mail.ru    # https://pensiya.ru/ (домен должен указывать на IP сервера)
```

Повторный запуск обновляет файлы калькулятора и ничего не ломает.
