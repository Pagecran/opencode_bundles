#pragma once

#include "Containers/Ticker.h"
#include "CoreMinimal.h"
#include "Interfaces/IPv4/IPv4Endpoint.h"

class FTcpListener;
class FJsonObject;
class FSocket;
class FPagecranBridgeMethodRegistry;

class PAGECRANUNREALBRIDGE_API FPagecranBridgeServer
{
public:
    explicit FPagecranBridgeServer(FPagecranBridgeMethodRegistry* InMethodRegistry);
    ~FPagecranBridgeServer();

    bool Start(const FString& InHost, int32 InPort);
    void Stop();
    bool IsRunning() const;
    FString GetHost() const;
    int32 GetPort() const;

private:
    struct FClientConnection
    {
        FSocket* Socket = nullptr;
        FString Endpoint;
        FString Buffer;
    };

    bool HandleConnectionAccepted(FSocket* ClientSocket, const FIPv4Endpoint& ClientEndpoint);
    bool Tick(float DeltaTime);
    bool ReceiveFromClient(FClientConnection& Client);
    void ProcessClientBuffer(FClientConnection& Client);
    void DispatchMessage(FClientConnection& Client, const FString& RawMessage);
    void SendResult(FClientConnection& Client, const FString& Id, const TSharedPtr<FJsonObject>& Result) const;
    void SendError(FClientConnection& Client, const FString& Id, const FString& ErrorMessage) const;
    void SendJson(FClientConnection& Client, const TSharedPtr<FJsonObject>& Message) const;
    void BroadcastEvent(const FString& EventName, const TSharedPtr<FJsonObject>& Data);
    TArray<int32> CollectDisconnectedClientIndexes() const;
    void RemoveClients(const TArray<int32>& Indexes);

    FPagecranBridgeMethodRegistry* MethodRegistry = nullptr;
    TUniquePtr<FTcpListener> Listener;
    FTSTicker::FDelegateHandle TickHandle;
    TArray<FClientConnection> Clients;
    FString Host = TEXT("127.0.0.1");
    int32 Port = 9877;
    bool bRunning = false;
};
