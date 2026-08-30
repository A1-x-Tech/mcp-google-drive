# <img src="./assets/a1-logo.svg" alt="A1" width="40"> Google Drive MCP

[English](./README.md) | **Русский**

[![npm](https://img.shields.io/npm/v/%40a1-x-tech%2Fmcp-google-drive)](https://www.npmjs.com/package/@a1-x-tech/mcp-google-drive)
[![CI](https://github.com/A1-x-Tech/mcp-google-drive/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-drive/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-drive/badges/score.svg)](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-drive)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**A1 Google Drive MCP** позволяет AI-приложению работать с вашим Google Drive на естественном языке. Можно найти файл, навести порядок в папках, загрузить и скачать содержимое, экспортировать документ в Markdown, поделиться им с нужными людьми — и держать корзину между вами и безвозвратным удалением.

Сервер работает с Google Drive API через ваш Google-аккаунт. Он одинаково видит «Мой диск» и общие диски, понимает «удалить» как обратимую корзину и явно показывает ограничения Drive API, а не создаёт впечатление, что с файлами можно сделать всё.

- **15 инструментов.** Поиск и метаданные, папки и перемещение, загрузка и скачивание, экспорт Docs/Sheets/Slides, корзина, доступы и комментарии.
- **Сначала корзина.** «Удалить» означает обратимую корзину; безвозвратное удаление — сознательно отдельный инструмент, который нельзя выбрать случайно.
- **Документы остаются целыми.** Docs, Sheets и Slides перемещаются, копируются, экспортируются и конвертируются как целые файлы — сервер никогда не редактирует текст внутри них.
- **Scope выбираете вы.** Для чтения достаточно `drive.readonly`, `drive.file` ограничивает доступ файлами приложения; полный набор инструментов требует `drive`.

Начните с запроса, который только читает данные:

> Найди в моём Drive документ с планом проекта, экспортируй его в Markdown и кратко перескажи.

[Подключить сервер](#быстрый-старт) · [Посмотреть сценарии](#что-можно-поручить) · [Открыть техническую документацию](#техническая-документация)

---

## Увидеть работу за минуту

> **Вы:** Покажи содержимое папки «Договоры 2025», сначала новые.
>
> **Ассистент:** Показывает файлы с типами, владельцами и датами изменения. Ничего не меняется.
>
> **Вы:** Подготовь вложенную папку «Архив» и перенеси туда всё старше года.
>
> **Ассистент:** Показывает папку, которую создаст, и файлы, которые перенесёт, затем запрашивает подтверждение.
>
> **Вы:** Подтверждаю.
>
> **Ассистент:** Создаёт папку и переносит файлы. Ничего не расшаривается, не отправляется в корзину и не удаляется, пока вы не попросите об этом отдельно.

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Что можно поручить](#что-можно-поручить)
- [Как меняется ваш Drive](#как-меняется-ваш-drive)
- [Что может измениться](#что-может-измениться)
- [Как получить доступ](#как-получить-доступ)
- [Конфигурация](#конфигурация)
- [Данные, лимиты и работа в фоне](#данные-лимиты-и-работа-в-фоне)
- [Техническая документация](#техническая-документация)
- [Поддержка](#поддержка)

## Быстрый старт

Нужны Node.js 20+, Google-аккаунт и OAuth-данные из проекта Google Cloud с включённым Google Drive API.

1. [Подготовьте Google OAuth-доступ](#как-получить-доступ).
2. Добавьте сервер в AI-приложение.
3. Отправьте запрос, который только читает данные.

<details open>
<summary><strong>Codex</strong></summary>

<br>

**В desktop-приложении:** откройте **Settings → MCP servers**, нажмите **Add server**, выберите **STDIO** и укажите команду `npx -y @a1-x-tech/mcp-google-drive@latest` вместе с переменными `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` и `GOOGLE_DRIVE_REFRESH_TOKEN`. Нажмите **Save**, затем **Restart**.

**В IDE-расширении:** откройте **gear menu → MCP servers**, нажмите **Add server**, выберите **STDIO** и укажите ту же команду и переменные окружения. Нажмите **Save**, затем **Restart extension**.

**В командной строке:**

```bash
codex mcp add google-drive \
  --env GOOGLE_DRIVE_CLIENT_ID=your_client_id \
  --env GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token \
  -- npx -y @a1-x-tech/mcp-google-drive@latest
```

```bash
codex mcp list
```

[Документация Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

</details>

<details>
<summary><strong>Claude Code</strong></summary>

<br>

```bash
claude mcp add \
  --env GOOGLE_DRIVE_CLIENT_ID=your_client_id \
  --env GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token \
  --transport stdio --scope user google-drive \
  -- npx -y @a1-x-tech/mcp-google-drive@latest
```

```bash
claude mcp list
```

[Документация Claude Code MCP](https://code.claude.com/docs/en/mcp)

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

<br>

Актуальный официальный путь — **Settings → Extensions**. Для пользовательского desktop extension откройте **Advanced settings → Extension Developer → Install Extension…**, выберите файл `.mcpb` и следуйте подсказкам.

Этот репозиторий сейчас публикует npm-пакет со stdio и пока не содержит `.mcpb`. Поэтому используйте приведённый ниже JSON stdio-конфиг как fallback только в сборках Claude Desktop, где ещё поддерживается локальная конфигурация:

```json
{
  "mcpServers": {
    "google-drive": {
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-drive@latest"],
      "env": {
        "GOOGLE_DRIVE_CLIENT_ID": "your_client_id",
        "GOOGLE_DRIVE_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_DRIVE_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

В таких сборках сохраните его в `~/Library/Application Support/Claude/claude_desktop_config.json` на macOS или `%APPDATA%\Claude\claude_desktop_config.json` на Windows.

[Документация Claude Desktop MCP](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

</details>

<details>
<summary><strong>Cursor</strong></summary>

<br>

Добавьте в `~/.cursor/mcp.json` на macOS/Linux или `%USERPROFILE%\.cursor\mcp.json` на Windows:

```json
{
  "mcpServers": {
    "google-drive": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-drive@latest"],
      "env": {
        "GOOGLE_DRIVE_CLIENT_ID": "your_client_id",
        "GOOGLE_DRIVE_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_DRIVE_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

[Документация Cursor MCP](https://cursor.com/docs/mcp)

</details>

<details>
<summary><strong>VS Code</strong></summary>

<br>

Запустите **MCP: Open User Configuration** и добавьте:

```json
{
  "servers": {
    "google-drive": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-drive@latest"],
      "env": {
        "GOOGLE_DRIVE_CLIENT_ID": "${input:drive_client_id}",
        "GOOGLE_DRIVE_CLIENT_SECRET": "${input:drive_client_secret}",
        "GOOGLE_DRIVE_REFRESH_TOKEN": "${input:drive_refresh_token}"
      }
    }
  },
  "inputs": [
    { "type": "promptString", "id": "drive_client_id", "description": "Google OAuth client ID" },
    { "type": "promptString", "id": "drive_client_secret", "description": "Google OAuth client secret", "password": true },
    { "type": "promptString", "id": "drive_refresh_token", "description": "Google OAuth refresh token", "password": true }
  ]
}
```

Проверьте сервер командой **MCP: List Servers**.

[Документация VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

## Что можно поручить

### Найти и прочитать файлы

- Найди таблицу с бюджетом за прошлый квартал и покажи, где она лежит и кто владелец.
- Экспортируй бриф проекта в Markdown и кратко изложи открытые вопросы.
- Скачай подписанный договор в PDF в мою папку с отчётами.

### Навести порядок и перенести содержимое

- Создай папку «Отчёты 2026» и перенеси в неё ежемесячные отчёты.
- Загрузи эти заметки со встречи и преврати их в Google Doc.
- Скопируй шаблон предложения и переименуй копию под нового клиента.

### Поделиться и обсудить

- Дай коллеге доступ к папке с правом комментировать и добавь сопроводительное сообщение к приглашению.
- Покажи открытые комментарии в дизайн-документе и закрой те, что уже учтены.
- Отзови у внешнего подрядчика доступ к архиву.

### Убрать лишнее осознанно

- Отправь устаревшие черновики в корзину — и восстанови тот, что удалён по ошибке.
- Удали папку с тестовыми загрузками безвозвратно, когда я подтвержу.
- Покажи содержимое корзины, пока оно не вычищено.

## Как меняется ваш Drive

1. Всё в Drive — включая папки и объекты общих дисков — это **файл** с id. Имена не уникальны, поэтому инструменты работают по id, а дубли имён допустимы: перед созданием стоит поискать.
2. «Удалить» означает **корзину**: обратимо, Google вычищает её примерно через 30 дней. Безвозвратное удаление минует корзину, забирает с собой поддеревья папок и живёт в сознательно отдельном инструменте.
3. Google Docs, Sheets и Slides перемещаются, копируются, расшариваются, экспортируются и конвертируются как целые единицы. У сервера нет инструмента, который правит текст внутри документа или ячейки внутри таблицы.
4. Запись никогда не повторяется после неопределённого сбоя: повторы после сетевых и `5xx` ошибок действуют только для чтения, поэтому копия, загрузка или новая папка не задвоятся у вас за спиной.

Встроенная загрузка ограничена 5 МБ (файлы крупнее идут через resumable-сессию в `raw_request`), экспорт — 10 МБ по ограничению Drive API. Комментарии, созданные через API, нельзя привязать к конкретному месту в тексте документа.

## Что может измениться

| Операция | Что происходит | Граница подтверждения |
|---|---|---|
| Поиск, метаданные, скачивание, экспорт | Читает файлы и папки | Ничего не меняет |
| Создание папки, копирование или загрузка | Добавляет файлы или заменяет содержимое | Меняет Drive |
| Перемещение, переименование, обновление метаданных | Меняет расположение или свойства файла | Меняет файл |
| Управление доступами | Выдаёт, меняет или отзывает доступ | Меняет, кто может открыть файл |
| Управление комментариями | Создаёт, закрывает или удаляет ветки комментариев | Может уничтожить обсуждение |
| Корзина и восстановление | Переносит файл в корзину или обратно | Обратимо ~30 дней |
| Безвозвратное удаление | Стирает мимо корзины, включая поддеревья | Разрушительно |
| Технический запрос API | Может вызвать метод API без отдельного инструмента | Потенциально разрушительно |

Как AI-приложение просит подтверждение, определяет само приложение. Сервер помечает операции чтения, записи и удаления, чтобы оно отличило проверку от рабочего изменения.

## Как получить доступ

Google Drive требует OAuth 2.0: одного API-ключа недостаточно.

1. Создайте или выберите проект Google Cloud и включите **Google Drive API**.
2. Настройте OAuth consent screen и создайте OAuth-клиент типа **Desktop app**.
3. Авторизуйте Google-аккаунт, с чьими файлами должен работать сервер. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) поможет получить refresh token, если включить **Use your own OAuth credentials**.
4. Запросите самый узкий scope, который покрывает вашу задачу:

   | Scope | Что даёт |
   |---|---|
   | `https://www.googleapis.com/auth/drive.readonly` | Инструменты только для чтения: поиск, метаданные, скачивание, экспорт и список общих дисков. |
   | `https://www.googleapis.com/auth/drive.file` | Только файлы, созданные или открытые этим приложением, — достаточно для сценариев «загрузить и разложить» со своими файлами. |
   | `https://www.googleapis.com/auth/drive` | Полный набор инструментов: доступы, корзина, удаление и комментарии к любым файлам. |

Сервер использует тот scope, с которым выпущен refresh token; вызов за его пределами завершается ошибкой `insufficientPermissions`.

Refresh token OAuth-приложения в режиме Testing может истечь через семь дней. Для долгого доступа опубликуйте OAuth-приложение или используйте Internal-приложение в домене Workspace. Храните client secret и refresh token как пароли.

## Конфигурация

| Переменная | Обязательна | Описание |
|---|---|---|
| `GOOGLE_DRIVE_CLIENT_ID` | Да* | OAuth client ID. |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Да* | OAuth client secret. |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Да* | OAuth refresh token. |
| `GOOGLE_DRIVE_ACCESS_TOKEN` | Да* | Короткоживущая (~1 час) альтернатива OAuth-тройке. |
| `GOOGLE_DRIVE_API_BASE` | Нет | Переопределяет базовый URL Google APIs. |
| `GOOGLE_DRIVE_TIMEOUT_MS` | Нет | Тайм-аут одного запроса; по умолчанию `60000` мс. |
| `GOOGLE_DRIVE_MAX_RETRIES` | Нет | Повторы временных ошибок; по умолчанию `3`. |

\* Передайте OAuth-тройку или access token.

Совсем без учётных данных сервер всё равно стартует и завершает MCP-рукопожатие; первый вызов инструмента отвечает точным списком переменных, которые нужно задать, вместо мёртвого сервера.

## Данные, лимиты и работа в фоне

- **Запросы идут в Google Drive.** Локальный сервер обновляет OAuth-токены Google и вызывает Drive API. Анонимная телеметрия содержит ID установки, версию пакета, версии AI-клиента и платформы, а также имена инструментов — но не OAuth-токены, содержимое файлов, аргументы или промпты. Чтобы отключить её, задайте `ASKADS_TELEMETRY=0`.
- **У Google есть квоты и лимиты размеров.** Загрузка через встроенный инструмент ограничена 5 МБ, экспорт — 10 МБ. При `429` сервер использует задержку; чтение также повторяется после сетевых и `5xx` ошибок, а запись после неопределённой ошибки не повторяется.
- **С локальными файлами сервер осторожен.** Скачивание сохраняет только по абсолютным путям и не перезаписывает существующий файл без явного разрешения; ответ прямо в диалоге ограничен 100 КБ текста.
- **Постоянного опроса нет.** Сервер работает только при вызове; между запросами никто не следит за вашим Drive. Если AI-приложение поддерживает задания по расписанию, оно может периодически проверять изменения.

## Техническая документация

- [Каталог MCP-возможностей](./docs/capabilities/index.md) — страницы по пользовательским задачам для каждого инструмента.
- [Все инструменты и параметры](./docs/TOOLS.md)
- [Документация по разработке](./docs/DEVELOPMENT.md)
- [Документация по публикации](./docs/PUBLISHING.md)
- [Справочник Google Drive API](https://developers.google.com/drive/api)

## Поддержка

Нашли ошибку или не хватает сценария? [Создайте issue](https://github.com/A1-x-Tech/mcp-google-drive/issues) или напишите в [Telegram](https://t.me/a1_mcp).

<br>

<p align="center">
  <img src="https://github.com/ztemerbekov/a1-yandex-kit-skills/raw/main/assets/images/mona-hifive-yandex-kit-warm.gif" alt="Две Моны дают пять" width="256">
</p>

<p align="center">
  Вы дочитали до конца!
</p>
