// Учебный скрипт BreachLab. Ошибка разработчика: проверка пароля сделана в браузере,
// поэтому любой посетитель может прочитать этот файл.
(function () {
  // Промокод сохраняется в cookie - посмотрите во вкладке DevTools → Application (Приложение) → Cookies
  document.cookie = "promo=BL{cookies_in_devtools}; SameSite=Lax; max-age=86400";

  var STAFF_LOGIN = "barista";
  var STAFF_PASS = "latte2026";   // так делать нельзя: пароль виден всем
  var SECRET = "BL{client_side_is_not_security}";

  document.getElementById("staff").addEventListener("submit", function (e) {
    e.preventDefault();
    var ok = document.getElementById("login").value === STAFF_LOGIN &&
             document.getElementById("pass").value === STAFF_PASS;
    document.getElementById("out").textContent = ok ? "Добро пожаловать! Секрет: " + SECRET : "Неверный логин или пароль";
  });
})();
