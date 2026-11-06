const form = document.getElementById("search-form");
const message = document.getElementById("message");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = document.getElementById("query").value.trim();
  if (!query) { message.textContent = "검색어를 입력해 주세요."; return; }
  message.textContent = "검색 상태를 확인하고 있습니다.";
  try {
    const response = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
    const body = await response.json();
    message.textContent = response.ok ? "검색 결과가 없습니다." : (typeof body.detail === "string" ? body.detail : "검색 요청을 확인해 주세요.");
  } catch { message.textContent = "서버에 연결할 수 없습니다. 연결 상태를 확인해 주세요."; }
});
