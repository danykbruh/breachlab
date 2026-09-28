-- =====================================================================
-- BreachLab — стартовые комнаты (без ответов: ответы в answers.local.sql)
-- Можно запускать повторно: комнаты обновятся, прогресс пользователей сохранится.
-- =====================================================================

-- ---------- Комната 1: знакомство ----------
insert into public.rooms (slug, title, summary, body_md, category, difficulty, position, published)
values ('welcome', 'Добро пожаловать в BreachLab',
  'Как устроены комнаты, флаги и очки.',
$md$
## Как здесь всё устроено

**Комната** — это урок: немного теории и задания. Ответ на каждое задание нужно найти в тексте, в файлах комнаты или с помощью своих навыков.

**Флаг** — строка-ответ. Часто она выглядит так: `BL{что_то_внутри}`. Регистр и лишние пробелы не важны.

**Очки** начисляются за каждое решённое задание один раз. Рейтинг — во вкладке «Рейтинг».

> Правило платформы: навыки из комнат применяются **только** к учебным материалам BreachLab. Проверять чужие системы без письменного разрешения владельца нельзя — это незаконно.

Первый флаг этой комнаты: `BL{hello_breachlab}`
$md$,
  'soc', 'easy', 10, true)
on conflict (slug) do update set title = excluded.title, summary = excluded.summary, body_md = excluded.body_md,
  category = excluded.category, difficulty = excluded.difficulty, position = excluded.position, published = excluded.published;

insert into public.tasks (room_id, position, question, hint, answer_mask, points)
select r.id, v.position, v.question, v.hint, v.mask, v.points
from public.rooms r, (values
  (1, 'Найдите первый флаг в тексте комнаты.', 'Он в самом конце теории.', 'BL{*****_**********}', 10),
  (2, 'Сколько раз начисляются очки за одно задание?', 'Ответ числом.', '*', 10),
  (3, 'Можно ли применять навыки из комнат к чужим сайтам без разрешения владельца? (да/нет)', null, '***', 10)
) as v(position, question, hint, mask, points)
where r.slug = 'welcome'
on conflict (room_id, position) do update set question = excluded.question, hint = excluded.hint,
  answer_mask = excluded.answer_mask, points = excluded.points;

-- ---------- Комната 2: основы ИБ ----------
insert into public.rooms (slug, title, summary, body_md, category, difficulty, position, published)
values ('cia-triad', 'Основы: триада CIA',
  'Три свойства информации, которые защищает безопасность.',
$md$
## Триада CIA

Почти любая задача информационной безопасности сводится к защите трёх свойств:

| Свойство | По-английски | Что значит | Пример нарушения |
|---|---|---|---|
| **Конфиденциальность** | Confidentiality | Данные видят только те, кому положено | Утечка базы клиентов |
| **Целостность** | Integrity | Данные не изменены незаметно | Подмена реквизитов в счёте |
| **Доступность** | Availability | Данные и сервисы работают, когда нужны | Сайт лежит из-за DDoS |

## Как защищают

- **Конфиденциальность** — шифрование, разграничение доступа, двухфакторная аутентификация.
- **Целостность** — хеш-суммы, цифровые подписи, журналирование изменений.
- **Доступность** — резервные копии, дублирование серверов, защита от DDoS.

Специалист SOC, разбирая инцидент, первым делом спрашивает: *какое из трёх свойств пострадало?*
$md$,
  'soc', 'easy', 20, true)
on conflict (slug) do update set title = excluded.title, summary = excluded.summary, body_md = excluded.body_md,
  category = excluded.category, difficulty = excluded.difficulty, position = excluded.position, published = excluded.published;

insert into public.tasks (room_id, position, question, hint, answer_mask, points)
select r.id, v.position, v.question, v.hint, v.mask, v.points
from public.rooms r, (values
  (1, 'Какое свойство нарушено, если сайт компании не открывается из-за DDoS-атаки?', 'Одно слово по-русски.', null, 10),
  (2, 'Какое свойство нарушено при утечке базы клиентов?', null, null, 10),
  (3, 'Злоумышленник незаметно изменил номер счёта в платёжке. Какое свойство нарушено?', null, null, 10),
  (4, 'Английская буква триады, которая отвечает за резервные копии.', 'C, I или A?', '*', 10)
) as v(position, question, hint, mask, points)
where r.slug = 'cia-triad'
on conflict (room_id, position) do update set question = excluded.question, hint = excluded.hint,
  answer_mask = excluded.answer_mask, points = excluded.points;

select slug, (select count(*) from public.tasks t where t.room_id = r.id) as tasks from public.rooms r order by position;
