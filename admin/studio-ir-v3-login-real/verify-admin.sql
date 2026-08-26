select u.id, u.email, a.created_at
from auth.users u
join public.admins a on a.user_id=u.id
where lower(u.email)=lower('iarytsaraquel1504@gmail.com');
