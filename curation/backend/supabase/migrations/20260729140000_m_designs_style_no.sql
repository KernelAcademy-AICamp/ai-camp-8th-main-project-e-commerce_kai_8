-- m_designs에 style_no 추가(색변형 그룹핑 안정 키). supabase db push 로 적용.
alter table m_designs add column if not exists style_no text;
