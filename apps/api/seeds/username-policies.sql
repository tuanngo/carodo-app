-- Names nobody may claim as a username, beside the reserved words in code
-- (src/services/accounts/usernames.ts). Applied by `task db:reset` locally (and by the workers
-- tests), and remotely by `pnpm db:policies:<env>`. Idempotent and additive: an upsert, never a
-- wipe. A row added straight on a remote D1 survives a run, and a name listed here takes this
-- file's kind, match and note. Deleting a line here removes nothing from D1: lifting a policy is
-- an explicit DELETE run on its own. Owner reviews this list (backend-feed-v1 D1).
--
-- One statement on purpose: the tests apply it as it is.
--   kind:  'reserved' (answers reason reserved) | 'profane' (reason profane)
--   match: 'exact'    the whole name with '.' and '_' removed
--          'contains' anywhere in that form; only for words that sit inside no ordinary name
--                     (no 'ass', 'cock', 'dick', 'sex', 'pedo': class, peacock, dickson, sussex, torpedo)

INSERT INTO username_policies (name, kind, match, note, created_at) VALUES
-- Impersonation: platforms and authorities a driver could pose as
('appstore', 'reserved', 'exact', 'Apple', unixepoch() * 1000),
('applesupport', 'reserved', 'exact', 'Apple', unixepoch() * 1000),
('testflight', 'reserved', 'exact', 'Apple', unixepoch() * 1000),
('icloud', 'reserved', 'exact', 'Apple', unixepoch() * 1000),
('cloudflare', 'reserved', 'exact', 'Infrastructure', unixepoch() * 1000),
('openstreetmap', 'reserved', 'exact', 'Map data provider', unixepoch() * 1000),
('police', 'reserved', 'exact', 'Authority', unixepoch() * 1000),
('congan', 'reserved', 'exact', 'Công an (police)', unixepoch() * 1000),
('bocongan', 'reserved', 'exact', 'Bộ Công an', unixepoch() * 1000),
('csgt', 'reserved', 'exact', 'Cảnh sát giao thông (traffic police)', unixepoch() * 1000),
('canhsatgiaothong', 'reserved', 'exact', 'Cảnh sát giao thông', unixepoch() * 1000),
('chinhphu', 'reserved', 'exact', 'Chính phủ (government)', unixepoch() * 1000),
('vneid', 'reserved', 'exact', 'VNeID', unixepoch() * 1000),
('dangkiem', 'reserved', 'exact', 'Đăng kiểm (vehicle inspection)', unixepoch() * 1000),
('vetc', 'reserved', 'exact', 'VETC toll operator', unixepoch() * 1000),
('epass', 'reserved', 'exact', 'ePass toll operator', unixepoch() * 1000),
('moderation', 'reserved', 'exact', 'Reads as staff', unixepoch() * 1000),
('carodoapp', 'reserved', 'exact', 'Carodo (also caught by code)', unixepoch() * 1000),
-- English, inside any name
('fuck', 'profane', 'contains', 'EN', unixepoch() * 1000),
('fuk', 'profane', 'contains', 'EN', unixepoch() * 1000),
('shit', 'profane', 'contains', 'EN', unixepoch() * 1000),
('cunt', 'profane', 'contains', 'EN', unixepoch() * 1000),
('nigger', 'profane', 'contains', 'EN slur', unixepoch() * 1000),
('nigga', 'profane', 'contains', 'EN slur', unixepoch() * 1000),
('faggot', 'profane', 'contains', 'EN slur', unixepoch() * 1000),
('bitch', 'profane', 'contains', 'EN', unixepoch() * 1000),
('whore', 'profane', 'contains', 'EN', unixepoch() * 1000),
('slut', 'profane', 'contains', 'EN', unixepoch() * 1000),
('rapist', 'profane', 'contains', 'EN', unixepoch() * 1000),
('pussy', 'profane', 'contains', 'EN', unixepoch() * 1000),
('asshole', 'profane', 'contains', 'EN', unixepoch() * 1000),
('bastard', 'profane', 'contains', 'EN', unixepoch() * 1000),
('wanker', 'profane', 'contains', 'EN', unixepoch() * 1000),
('retard', 'profane', 'contains', 'EN', unixepoch() * 1000),
('hitler', 'profane', 'contains', 'EN', unixepoch() * 1000),
('porn', 'profane', 'contains', 'EN', unixepoch() * 1000),
('hentai', 'profane', 'contains', 'EN', unixepoch() * 1000),
('xxx', 'profane', 'contains', 'EN', unixepoch() * 1000),
('penis', 'profane', 'contains', 'EN', unixepoch() * 1000),
('vagina', 'profane', 'contains', 'EN', unixepoch() * 1000),
('dildo', 'profane', 'contains', 'EN', unixepoch() * 1000),
('blowjob', 'profane', 'contains', 'EN', unixepoch() * 1000),
('handjob', 'profane', 'contains', 'EN', unixepoch() * 1000),
('jizz', 'profane', 'contains', 'EN', unixepoch() * 1000),
('incest', 'profane', 'contains', 'EN', unixepoch() * 1000),
('pedophile', 'profane', 'contains', 'EN', unixepoch() * 1000),
('paedo', 'profane', 'contains', 'EN', unixepoch() * 1000),
-- English, only as the whole name
('dick', 'profane', 'exact', 'EN', unixepoch() * 1000),
('cock', 'profane', 'exact', 'EN', unixepoch() * 1000),
('sex', 'profane', 'exact', 'EN', unixepoch() * 1000),
('cum', 'profane', 'exact', 'EN', unixepoch() * 1000),
('tits', 'profane', 'exact', 'EN', unixepoch() * 1000),
('boobs', 'profane', 'exact', 'EN', unixepoch() * 1000),
('rape', 'profane', 'exact', 'EN', unixepoch() * 1000),
('nazi', 'profane', 'exact', 'EN', unixepoch() * 1000),
('kkk', 'profane', 'exact', 'EN', unixepoch() * 1000),
('pedo', 'profane', 'exact', 'EN', unixepoch() * 1000),
('milf', 'profane', 'exact', 'EN', unixepoch() * 1000),
('twat', 'profane', 'exact', 'EN', unixepoch() * 1000),
-- Vietnamese without marks, inside any name
('ditme', 'profane', 'contains', 'VI đ** mẹ', unixepoch() * 1000),
('ditmay', 'profane', 'contains', 'VI', unixepoch() * 1000),
('ditcon', 'profane', 'contains', 'VI', unixepoch() * 1000),
('ditbo', 'profane', 'contains', 'VI', unixepoch() * 1000),
('dume', 'profane', 'contains', 'VI đ* mẹ', unixepoch() * 1000),
('duma', 'profane', 'contains', 'VI đ* má', unixepoch() * 1000),
('dumay', 'profane', 'contains', 'VI', unixepoch() * 1000),
('deome', 'profane', 'contains', 'VI', unixepoch() * 1000),
('deomay', 'profane', 'contains', 'VI', unixepoch() * 1000),
('concac', 'profane', 'contains', 'VI', unixepoch() * 1000),
('cailon', 'profane', 'contains', 'VI', unixepoch() * 1000),
('vailon', 'profane', 'contains', 'VI', unixepoch() * 1000),
('vailoz', 'profane', 'contains', 'VI', unixepoch() * 1000),
('occho', 'profane', 'contains', 'VI óc chó', unixepoch() * 1000),
('thangcho', 'profane', 'contains', 'VI', unixepoch() * 1000),
('nguvl', 'profane', 'contains', 'VI', unixepoch() * 1000),
-- Vietnamese abbreviations, only as the whole name
('dmm', 'profane', 'exact', 'VI', unixepoch() * 1000),
('dcm', 'profane', 'exact', 'VI', unixepoch() * 1000),
('dcmm', 'profane', 'exact', 'VI', unixepoch() * 1000),
('dkm', 'profane', 'exact', 'VI', unixepoch() * 1000),
('cdm', 'profane', 'exact', 'VI', unixepoch() * 1000),
('vcl', 'profane', 'exact', 'VI', unixepoch() * 1000),
('vkl', 'profane', 'exact', 'VI', unixepoch() * 1000),
('vcc', 'profane', 'exact', 'VI', unixepoch() * 1000),
('clm', 'profane', 'exact', 'VI', unixepoch() * 1000),
('cmm', 'profane', 'exact', 'VI', unixepoch() * 1000),
('loz', 'profane', 'exact', 'VI', unixepoch() * 1000),
('lozz', 'profane', 'exact', 'VI', unixepoch() * 1000),
('chich', 'profane', 'exact', 'VI', unixepoch() * 1000)
ON CONFLICT (name) DO UPDATE SET kind = excluded.kind, match = excluded.match, note = excluded.note;
