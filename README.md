# ldap-ui-app
UI app for ldap
react ui

```
docker exec -it ldap-crypto-monolith tail -f /var/log/fastapi.out.log
```
```
docker exec -it ldap-crypto-monolith tail -n 20 /var/log/fastapi.err.log
```

docker exec -it ldap-crypto-monolith ldapsearch -x -H ldap://localhost:1389 -b "dc=crypto,dc=lake" -D "cn=admin,dc=crypto,dc=lake" -w "SuperSecretCryptoPassword2026"
