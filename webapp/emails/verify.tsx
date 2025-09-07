export default function VerifyEmail({ link }: { link: string }) {
return (
<div dir="rtl" style={{ fontFamily: 'Tahoma, Arial, sans-serif' }}>
<h1>تأیید ایمیل NEXUSA</h1>
<p>برای فعال‌سازی حساب، روی لینک زیر بزنید:</p>
<p><a href={link}>{link}</a></p>
<p>اگر شما درخواست ثبت‌نام نکرده‌اید، این پیام را نادیده بگیرید.</p>
</div>
);
}